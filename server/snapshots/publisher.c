
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

#define SNAPSHOT_INTERVAL 30
#define MAX_BUFFER_SIZE 5 * 1024 * 1024 // 5MB max for image data

volatile bool running = true;

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

#define CONFIG_FILE_DEFAULT "secrets.txt"
#define MAX_CONFIG_LINE 256
#define MAX_CONFIG_VALUE 512

char config_mqtt_broker[MAX_CONFIG_VALUE] = "";
char config_rtsp_url[MAX_CONFIG_VALUE] = "";

bool config_load(int argc, const char **argv) {
    const char *path = CONFIG_FILE_DEFAULT;
    if (argc > 1)
        path = argv[1];
    FILE *file = fopen(path, "r");
    if (file == NULL) {
        fprintf(stderr, "Config: could not load '%s', using defaults (which may not work correctly)\n", path);
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
            }
        }
    }
    fclose(file);
    printf("config: '%s': mqtt=%s, rtsp=%s\n", path, config_mqtt_broker, config_rtsp_url);
    return (config_mqtt_broker[0] != '\0' && config_rtsp_url[0] != '\0');
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

struct mosquitto *mosq = NULL;

void mqtt_connect_callback(struct mosquitto *mosq, void *obj, int result) {
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
        strncpy(host, config_mqtt_broker, sizeof(host) - 1);
    }
    char *port_str = strchr(host, ':');
    if (port_str) {
        *port_str = '\0'; // Terminate host string at colon
        port = atoi(port_str + 1);
    }
    printf("mqtt: connecting to '%s' (host='%s', port=%d, ssl=%s)\n", config_mqtt_broker, host, port,
           use_ssl ? "true" : "false");
    char client_id[32];
    snprintf(client_id, sizeof(client_id), "snapshots-publisher-%06X", rand() & 0xFFFFFF);
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

bool snapshot_active = false;
int snapshot_skipped_now = 0;
int snapshot_skipped_all = 0;

bool snapshot_capture(void) {
    time_t now = time(NULL);
    struct tm *timeinfo = localtime(&now);
    char timestamp[15];
    strftime(timestamp, sizeof(timestamp), "%Y%m%d%H%M%S", timeinfo);
    char filename[32];
    snprintf(filename, sizeof(filename), "snapshot_%s.jpg", timestamp);
    int pipefd[2];
    if (pipe(pipefd) == -1) {
        perror("pipe");
        return false;
    }
    pid_t pid = fork();
    if (pid == -1) {
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
        execlp("ffmpeg", "ffmpeg", "-y", "-loglevel", "quiet", // Suppress ffmpeg logs
               "-rtsp_transport", "tcp", "-i", config_rtsp_url, "-vframes", "1", "-q:v", "6", "-pix_fmt", "yuv420p",
               "-chroma_sample_location", "center", "-f", "image2pipe", "-", NULL);
        perror("execlp");
        exit(EXIT_FAILURE);
    }
    close(pipefd[1]); // Parent process
    unsigned char *buffer = malloc(MAX_BUFFER_SIZE);
    if (!buffer) {
        perror("malloc");
        close(pipefd[0]);
        return false;
    }
    size_t total_bytes = 0;
    ssize_t bytes_read;
    while ((bytes_read = read(pipefd[0], buffer + total_bytes, MAX_BUFFER_SIZE - total_bytes)) > 0) {
        total_bytes += bytes_read;
        if (total_bytes >= MAX_BUFFER_SIZE) {
            fprintf(stderr, "publisher: image too large for buffer\n");
            break;
        }
    }
    close(pipefd[0]);
    int status;
    waitpid(pid, &status, 0);
    if (WIFEXITED(status) && WEXITSTATUS(status) != 0) {
        fprintf(stderr, "publisher: ffmpeg exited with status %d\n", WEXITSTATUS(status));
        free(buffer);
        return false;
    }
    char metadata[256];
    snprintf(metadata, sizeof(metadata), "{\"filename\":\"%s\",\"timestamp\":\"%s\",\"size\":%zu}", filename, timestamp,
             total_bytes);

    if (mosq && total_bytes > 0) {
        int result = mosquitto_publish(mosq, NULL, "snapshots/imagedata", total_bytes, buffer, 0, false);
        if (result != MOSQ_ERR_SUCCESS)
            fprintf(stderr, "mqtt: imagedata publish error: %s\n", mosquitto_strerror(result));
        result = mosquitto_publish(mosq, NULL, "snapshots/metadata", strlen(metadata), metadata, 0, false);
        if (result != MOSQ_ERR_SUCCESS)
            fprintf(stderr, "mqtt: metadata publish error: %s\n", mosquitto_strerror(result));
        printf("publisher: published '%s' (%zu bytes)\n", filename, total_bytes);
    }
    free(buffer);
    return true;
}

void snapshot_execute(void) {
    if (snapshot_active) {
        snapshot_skipped_now++;
        snapshot_skipped_all++;
        printf("publisher: capture still active (%d / %d), skipping this cycle\n", snapshot_skipped_now,
               snapshot_skipped_all);
        return;
    }
    snapshot_active = true;
    if (!snapshot_capture())
        fprintf(stderr, "publisher: snapshot capture error\n");
    snapshot_active = false;
    snapshot_skipped_now = 0;
}

void snapshot_runner(void) {
    printf("publisher: executing (interval=%d seconds)\n", SNAPSHOT_INTERVAL);
    while (running) {
    	snapshot_execute();
        for (int i = 0; i < SNAPSHOT_INTERVAL && running; i++)
            sleep(1);
    }
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------

void cleanup(void) {
    running = false;
    mqtt_end();
}

void signal_handler(int sig) {
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
        cleanup();
        return EXIT_FAILURE;
    }
    snapshot_runner ();
    cleanup();
    return EXIT_SUCCESS;
}

// -----------------------------------------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------------------------------
