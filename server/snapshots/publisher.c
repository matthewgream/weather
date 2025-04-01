
// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * RTSP Snapshot Publisher (C Version)
 *
 * This program captures snapshots from an RTSP stream using ffmpeg
 * and publishes them to MQTT. It's a C implementation of the Node.js
 * snapshot publisher with lower memory usage.
 *
 * Compile with:
 * gcc -o snapshot_publisher snapshot_publisher.c -lmosquitto -lpthread
 */

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <mosquitto.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define MQTT_BROKER_DEFAULT "mqtt://localhost"
#define SNAPSHOT_INTERVAL_DEFAULT 30

#define MAX_BUFFER_SIZE 5 * 1024 * 1024 // 5MB

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

#define CONFIG_FILE_DEFAULT "secrets.txt"
#define MAX_CONFIG_LINE 256
#define MAX_CONFIG_VALUE 512

char config_mqtt_broker[MAX_CONFIG_VALUE] = MQTT_BROKER_DEFAULT;
char config_rtsp_url[MAX_CONFIG_VALUE] = "";
int config_snapshot_interval = SNAPSHOT_INTERVAL_DEFAULT;

bool config_load(int argc, const char **argv) {
    const char *path = CONFIG_FILE_DEFAULT;
    if (argc > 1)
        path = argv[1];
    FILE *file = fopen(path, "r");
    if (file == NULL) {
        fprintf(stderr, "config: could not load '%s', using defaults (which may not work correctly)\n", path);
        return false;
    }
    char line[MAX_CONFIG_LINE];
    while (fgets(line, sizeof(line), file)) {
        char *equals = strchr(line, '=');
        if (equals) {
            *equals = '\0';
            char *key = line;
            char *value = equals + 1;
            while (*key && isspace(*key))
                key++;
            char *end = key + strlen(key) - 1;
            while (end > key && isspace(*end))
                *end-- = '\0';
            while (*value && isspace(*value))
                value++;
            end = value + strlen(value) - 1;
            while (end > value && isspace(*end))
                *end-- = '\0';
            if (strcmp(key, "MQTT") == 0) {
                strncpy(config_mqtt_broker, value, sizeof(config_mqtt_broker) - 1);
            } else if (strcmp(key, "RTSP") == 0) {
                strncpy(config_rtsp_url, value, sizeof(config_rtsp_url) - 1);
            } else if (strcmp(key, "SNAPSHOT_INTERVAL") == 0) {
                config_snapshot_interval = atoi(value);
            }
        }
    }
    fclose(file);
    printf("config: '%s': mqtt=%s, rtsp=%s, interval=%d\n", path, config_mqtt_broker, config_rtsp_url,
           config_snapshot_interval);
    return (config_rtsp_url[0] != '\0');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

struct mosquitto *mosq = NULL;

void mqtt_connect_callback(struct mosquitto *mosq __attribute__((unused)), void *obj __attribute__((unused)),
                           int result) {
    if (result != 0) {
        fprintf(stderr, "mqtt: connect failed: %s\n", mosquitto_connack_string(result));
        return;
    }
    printf("mqtt: connected\n");
}

bool mqtt_begin(void) {
    char host[MAX_CONFIG_VALUE] = "";
    int port = 1883;
    bool use_ssl = false;
    if (strncmp(config_mqtt_broker, "mqtt://", 7) == 0) {
        strncpy(host, config_mqtt_broker + 7, sizeof(host) - 1);
    } else if (strncmp(config_mqtt_broker, "mqtts://", 8) == 0) {
        strncpy(host, config_mqtt_broker + 8, sizeof(host) - 1);
        use_ssl = true;
        port = 8883; // Default secure MQTT port
    } else {
        strcpy(host, config_mqtt_broker);
    }
    char *port_str = strchr(host, ':');
    if (port_str) {
        *port_str = '\0'; // Terminate host string at colon
        port = atoi(port_str + 1);
    }
    printf("mqtt: connecting to '%s' (host='%s', port=%d, ssl=%s)\n", config_mqtt_broker, host, port,
           use_ssl ? "true" : "false");
    char client_id[32 + 1];
    snprintf(client_id, sizeof(client_id) - 1, "snapshots-publisher-%06X", rand() & 0xFFFFFF);
    mosquitto_lib_init();
    mosq = mosquitto_new(client_id, true, NULL);
    if (!mosq) {
        fprintf(stderr, "mqtt: error creating client instance\n");
        return false;
    }
    if (use_ssl)
        mosquitto_tls_insecure_set(mosq, true); // Skip certificate validation
    mosquitto_connect_callback_set(mosq, mqtt_connect_callback);
    if (mosquitto_connect(mosq, host, port, 60) != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "mqtt: error connecting to broker\n");
        mosquitto_destroy(mosq);
        mosq = NULL;
        return false;
    }
    if (mosquitto_loop_start(mosq) != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "mqtt: error starting loop\n");
        mosquitto_disconnect(mosq);
        mosquitto_destroy(mosq);
        mosq = NULL;
        return false;
    }
    return true;
}

void mqtt_end(void) {
    if (mosq) {
        mosquitto_loop_stop(mosq, true);
        mosquitto_disconnect(mosq);
        mosquitto_destroy(mosq);
        mosq = NULL;
    }
    mosquitto_lib_cleanup();
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

unsigned char snapshot_buffer[MAX_BUFFER_SIZE];
int snapshot_skipped = 0;

bool snapshot_capture(void) {

    time_t time_entry = time(NULL);
    struct tm *timeinfo = localtime(&time_entry);

    int pipefd[2];
    if (pipe(pipefd) == -1) {
        perror("pipe");
        return false;
    }
    pid_t pid = fork();
    if (pid == -1) { // Error
        perror("fork");
        close(pipefd[0]);
        close(pipefd[1]);
        return false;
    }
    if (pid == 0) { // Child process
        close(pipefd[0]);
        dup2(pipefd[1], STDOUT_FILENO);
        int devnull = open("/dev/null", O_WRONLY);
        if (devnull >= 0) {
            dup2(devnull, STDERR_FILENO);
            close(devnull);
        }
        close(pipefd[1]);
        execlp("ffmpeg", "ffmpeg", "-y", "-loglevel", "quiet", "-rtsp_transport", "tcp", "-i", config_rtsp_url,
               "-vframes", "1", "-q:v", "6", "-pix_fmt", "yuvj420p", "-chroma_sample_location", "center", "-f",
               "image2pipe", "-", NULL);
        perror("execlp");
        exit(EXIT_FAILURE);
    }
    // Parent process
    close(pipefd[1]);
    size_t total_bytes = 0;
    ssize_t bytes_read;
    while ((bytes_read = read(pipefd[0], snapshot_buffer + total_bytes, MAX_BUFFER_SIZE - total_bytes)) > 0) {
        total_bytes += bytes_read;
        if (total_bytes >= MAX_BUFFER_SIZE) {
            fprintf(stderr, "publisher: ffmpeg image too large for buffer\n");
            total_bytes = 0;
            break;
        }
    }
    close(pipefd[0]);
    int status;
    waitpid(pid, &status, 0);
    if (WIFEXITED(status) && WEXITSTATUS(status) != 0) {
        fprintf(stderr, "publisher: ffmpeg exited with status %d\n", WEXITSTATUS(status));
        return false;
    }

    if (total_bytes == 0) {
        return false;
    }

    time_t total_time = time(NULL) - time_entry;
    char timestamp[15 + 1];
    strftime(timestamp, sizeof(timestamp) - 1, "%Y%m%d%H%M%S", timeinfo);
    char filename[32 + 1];
    snprintf(filename, sizeof(filename) - 1, "snapshot_%s.jpg", timestamp);

    char metadata[256];
    snprintf(metadata, sizeof(metadata), "{\"filename\":\"%s\",\"timestamp\":\"%s\",\"size\":%zu}", filename, timestamp,
             total_bytes);
    int result = mosquitto_publish(mosq, NULL, "snapshots/imagedata", total_bytes, snapshot_buffer, 0, false);
    if (result != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "mqtt: imagedata publish error: %s\n", mosquitto_strerror(result));
        return false;
    }
    result = mosquitto_publish(mosq, NULL, "snapshots/metadata", strlen(metadata), metadata, 0, false);
    if (result != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "mqtt: metadata publish error: %s\n", mosquitto_strerror(result));
        return false;
    }
    printf("publisher: published '%s' (%zu bytes) [%ld seconds]\n", filename, total_bytes, total_time);

    return true;
}

void snapshot_execute(volatile bool *running) {
    printf("publisher: executing (interval=%d seconds)\n", config_snapshot_interval);
    while (*running) {
        const time_t time_entry = time(NULL);
        if (!snapshot_capture()) {
            fprintf(stderr, "publisher: capture error, will retry\n");
        }
        const time_t time_leave = time(NULL);
        time_t next = time_entry + config_snapshot_interval;
        int skipped = 0;
        while (next < time_leave) {
            skipped++;
            next += config_snapshot_interval;
        }
        if (skipped) {
            snapshot_skipped += skipped;
            printf("publisher: capture skipped (%d now / %d all)\n", skipped, snapshot_skipped);
        }
        while (*running && time(NULL) < next)
            sleep(1);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

volatile bool running = true;

void signal_handler(int sig __attribute__((unused))) {
    printf("publisher: stopping\n");
    running = false;
}

int main(int argc, const char **argv) {
    setbuf(stdout, NULL);
    printf("publisher: starting\n");
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    if (!config_load(argc, argv)) {
        fprintf(stderr, "publisher: failed to load config\n");
        return EXIT_FAILURE;
    }
    if (!mqtt_begin()) {
        fprintf(stderr, "publisher: failed to connect to MQTT\n");
        mqtt_end();
        return EXIT_FAILURE;
    }
    snapshot_execute(&running);
    mqtt_end();
    printf("publisher: stopped\n");
    return EXIT_SUCCESS;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
