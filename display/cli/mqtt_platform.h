#if !defined(__MQTT_PAL_H__)
#define __MQTT_PAL_H__

#if defined(__cplusplus)
extern "C" {
#endif

#include <limits.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>
#include <arpa/inet.h>

#define MQTT_PAL_HTONS(s) htons(s)
#define MQTT_PAL_NTOHS(s) ntohs(s)

#define MQTT_PAL_TIME() time(NULL)

typedef time_t mqtt_pal_time_t;

typedef int mqtt_pal_handle;

ssize_t mqtt_pal_sendall(mqtt_pal_handle fd, const void* buf, size_t len, int flags);
ssize_t mqtt_pal_recvall(mqtt_pal_handle fd, void* buf, size_t bufsz, int flags);

int mqtt_pal_connect(const char* addr, const char* port);

#if defined(__cplusplus)
}
#endif


#endif
