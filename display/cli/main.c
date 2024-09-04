
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <poll.h>

#include <mqtt.h>
#include <json.h>

#define MQTT_SIZE_TOPIC 128
#define MQTT_SIZE_MESSAGE 512
#define MQTT_SIZE_BUFFER 2048

// --------------------------------------------------------------------------------------------------------------------------

int ngetc (char *c) {       
    struct pollfd pollfds = { .fd = STDIN_FILENO, .events = POLLIN };
    poll (&pollfds, 1, 0);
    if (!pollfds.revents & POLLIN)
		return -1;
    read (STDIN_FILENO, c, 1);
    return 0;
}

void terminate (int status, int handle) {
    if (handle != -1) close (handle);
    exit (status);
}

// --------------------------------------------------------------------------------------------------------------------------

int json_token_t_streq (const json_token_t *t, const char *s, const char *m) {
	return (t->type == JSON_STRING && (int) strlen (m) == (t->end - t->start) && strncmp (s + t->start, m, t->end - t->start) == 0) ? 0 : -1;
}

// --------------------------------------------------------------------------------------------------------------------------

typedef void (*json_callback_t) (const json_token_t t [], const json_length_t r, const json_string_t s);
typedef struct {
	char topic [MQTT_SIZE_TOPIC];
	json_callback_t callback;
} json_handler_t;
#define JSON_HANDLERS_NUMB 32
json_handler_t json_handlers_list [JSON_HANDLERS_NUMB];
int json_handlers_size = 0;
int json_handler_register (struct mqtt_client *client, const char *topic, json_callback_t callback) {
	if (json_handlers_size >= JSON_HANDLERS_NUMB || strlen (topic) > MQTT_SIZE_TOPIC)
		return 0;
	printf ("Subscribing to %s\n", topic);
	json_handler_t *handler = &json_handlers_list [json_handlers_size ++];
	strcpy (handler->topic, topic);
	handler->callback = callback;
	return mqtt_subscribe (client, topic, 0) == MQTT_OK;
}
void json_handler_process (const char *topic, const char *message, const json_token_t *t, const json_length_t r) {
	for (int i = 0; i < json_handlers_size; i ++)
		if (strcmp (json_handlers_list [i].topic, topic) == 0)
			json_handlers_list [i].callback (t, r, message);
}

void publish_callback (void **unused, struct mqtt_response_publish *published) {

	char topic [MQTT_SIZE_TOPIC];
    memcpy (topic, published->topic_name, published->topic_name_size);
    topic [published->topic_name_size] = '\0';

	char message [MQTT_SIZE_MESSAGE];
    memcpy (message, published->application_message, published->application_message_size);
    message [published->application_message_size] = '\0';

    printf ("Received: ('%s') %s\n", topic, message);

    const json_string_t s = message;
    json_parser_t p;
    json_token_t t [128];
    json_init (&p);
    const json_length_t r = json_parse (&p, s, strlen (s), t, sizeof (t) / sizeof (t [0]));
    if (r < 0)
        printf ("JSON parse failed: error %d\n", r);
    else if (r < 1 || t [0].type != JSON_OBJECT)
        printf ("JSON parse failed: expected Object at top level\n");
    else
		json_handler_process (topic, s, t, r);
}

// --------------------------------------------------------------------------------------------------------------------------

typedef struct {
	const char *source;
	const char *name;
} weather_variable_t;
typedef void (*weather_variable_handler_t) (const char *name, const char *value);

void process_weather_variables (const weather_variable_handler_t var_handler, const weather_variable_t var_list [], const int var_size, const json_token_t t [], const json_length_t r, const json_string_t s) {
	char value [MQTT_SIZE_MESSAGE];
    for (json_length_t i = 1; i < r; i ++)
		for (int j = 0; j < var_size; j ++)
        	if (json_token_t_streq (&t [i], s, var_list [j].source) == 0) {
    			memcpy (value, s + t [i + 1].start, t [i + 1].end - t [i + 1].start);
    			value [t [i + 1].end - t [i + 1].start] = '\0';
				var_handler (var_list [j].name, value);
			}
}

// --------------------------------------------------------------------------------------------------------------------------

void update_weather_variable (const char *name, const char* value) {
	printf (" --> %s: %s\n", name, value);
}
const weather_variable_t weather_variables_branna [] = {
	{ "runtime", "branna/outside/runtime" },
	{ "tempin", "branna/outside/temperature" },
	{ "humidityin", "branna/outside/humidity" },
	{ "baromrel", "branna/outside/pressure" },
	{ "tf_ch1", "branna/lake/surface/temperature" },
	{ "tf_ch2", "branna/lake/subsurface/temperature" },
	{ "tf_batt1", "branna/lake/surface/battery" },
	{ "tf_batt2", "branna/lake/subsurface/battery" }
};
void process_weather_branna (const json_token_t t [], const json_length_t r, const json_string_t s) {
	process_weather_variables (update_weather_variable, weather_variables_branna, sizeof (weather_variables_branna) / sizeof (weather_variable_t), t, r, s);
}
const weather_variable_t weather_variables_ulrikashus [] = {
	{ "runtime", "ulrikashus/inside/runtime" },
	{ "tempin", "ulrikashus/inside/temperature" },
	{ "humidityin", "ulrikashus/inside/humidity" },
	{ "baromrel", "ulrikahus/inside/pressure" }
};
void process_weather_ulrikashus (const json_token_t t [], const json_length_t r, const json_string_t s) {
	process_weather_variables (update_weather_variable, weather_variables_ulrikashus, sizeof (weather_variables_ulrikashus) / sizeof (weather_variable_t), t, r, s);
}
struct {
	const char *topic;
	void (*handler) (const json_token_t t [], const json_length_t r, const json_string_t s);
} weather_handlers [] = {
	{ "weather_branna", process_weather_branna },
	{ "weather_ulrikashus", process_weather_ulrikashus },
	{ NULL },
};

// --------------------------------------------------------------------------------------------------------------------------

int main(int argc, const char *argv[]) {
    
	const char *addr = "weather.local", *port = "1883";

    printf ("Connecting to %s:%s\n", addr, port);
    int handle = mqtt_pal_connect (addr, port);
    if (handle == -1) {
        perror ("Failed to open socket: ");
        terminate (EXIT_FAILURE, handle);
    }
    struct mqtt_client client;
    uint8_t sendbuf [MQTT_SIZE_BUFFER], recvbuf [MQTT_SIZE_BUFFER];
    mqtt_init (&client, handle, sendbuf, sizeof (sendbuf), recvbuf, sizeof (recvbuf), publish_callback);
    const char *client_id = NULL;
    uint8_t connect_flags = MQTT_CONNECT_CLEAN_SESSION;
    mqtt_connect (&client, client_id, NULL, NULL, 0, NULL, NULL, connect_flags, 400);
    if (client.error != MQTT_OK) {
        fprintf (stderr, "error: %s\n", mqtt_error_str (client.error));
        terminate (EXIT_FAILURE, handle);
    }

	for (int i = 0; weather_handlers [i].topic != NULL; i ++)
		if (!json_handler_register (&client, weather_handlers [i].topic, weather_handlers [i].handler)) {
        	fprintf (stderr, "error: %s\n", mqtt_error_str (client.error));
        	terminate (EXIT_FAILURE, handle);
		}

    printf ("Listening for messages, press any key to exit\n\n");
    char ch;
    while (ngetc (&ch) == -1) {
        mqtt_sync (&client);
        usleep (100000U);
    }

    printf ("Disconnecting from %s:%s\n", addr, port);
    sleep (1);
    terminate (EXIT_SUCCESS, handle);
}

// --------------------------------------------------------------------------------------------------------------------------

