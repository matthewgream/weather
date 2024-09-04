
#include <mqtt.h>

#include <errno.h>

ssize_t mqtt_pal_sendall(mqtt_pal_handle fd, const void* buf, size_t len, int flags) {
    enum MQTTErrors error = 0;
    size_t sent = 0;
    while(sent < len) {
        ssize_t rv = send(fd, (const char*)buf + sent, len - sent, flags);
        if (rv < 0 && errno == EAGAIN)
            break;
        if (rv <= 0) {
            error = MQTT_ERROR_SOCKET_ERROR;
            break;
        }
        sent += (size_t) rv;
    }
    if (sent == 0)
        return error;
    return (ssize_t)sent;
}

ssize_t mqtt_pal_recvall(mqtt_pal_handle fd, void* buf, size_t bufsz, int flags) {
    const void *const start = buf;
    enum MQTTErrors error = 0;
    ssize_t rv;
    do {
        rv = recv(fd, buf, bufsz, flags);
        if (rv < 0 && (errno == EAGAIN || errno == EWOULDBLOCK))
            break;
        if (rv <= 0) {
            error = MQTT_ERROR_SOCKET_ERROR;
            break;
        }
        buf = (char*)buf + rv;
        bufsz -= (unsigned long)rv;
    } while (bufsz > 0);
    if (buf == start)
        return error;
    return (char*)buf - (const char*)start;
}

#include <stdio.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <fcntl.h>
#include <unistd.h>

int mqtt_pal_connect(const char* addr, const char* port) {
    struct addrinfo hints = {0};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    int sockfd = -1;
    int rv;
    struct addrinfo *p, *servinfo;
    rv = getaddrinfo(addr, port, &hints, &servinfo);
    if(rv != 0) {
        fprintf(stderr, "Failed to open socket (getaddrinfo): %s\n", gai_strerror(rv));
        return -1;
    }
    for(p = servinfo; p != NULL; p = p->ai_next) {
        sockfd = socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (sockfd == -1) continue;
        rv = connect(sockfd, p->ai_addr, p->ai_addrlen);
        if(rv == -1) {
          close(sockfd);
          sockfd = -1;
          continue;
        }
        break;
    }  
    freeaddrinfo(servinfo);
    if (sockfd != -1) fcntl(sockfd, F_SETFL, fcntl(sockfd, F_GETFL) | O_NONBLOCK);
    return sockfd;
}

