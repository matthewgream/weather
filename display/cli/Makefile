
all: subscriber

subscriber: mqtt.c mqtt_platform.c main.c mqtt.h mqtt_platform.h json.h
	gcc -O6 -Wall -pedantic -I. -o subscriber mqtt.c mqtt_platform.c main.c


