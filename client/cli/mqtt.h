#if !defined(__MQTT_H__)
#define __MQTT_H__

#if defined(__cplusplus)
extern "C" {
#endif

#include <mqtt_platform.h>

enum MQTTControlPacketType {
    MQTT_CONTROL_CONNECT=1u,
    MQTT_CONTROL_CONNACK=2u,
    MQTT_CONTROL_PUBLISH=3u,
    MQTT_CONTROL_PUBACK=4u,
    MQTT_CONTROL_PUBREC=5u,
    MQTT_CONTROL_PUBREL=6u,
    MQTT_CONTROL_PUBCOMP=7u,
    MQTT_CONTROL_SUBSCRIBE=8u,
    MQTT_CONTROL_SUBACK=9u,
    MQTT_CONTROL_UNSUBSCRIBE=10u,
    MQTT_CONTROL_UNSUBACK=11u,
    MQTT_CONTROL_PINGREQ=12u,
    MQTT_CONTROL_PINGRESP=13u,
    MQTT_CONTROL_DISCONNECT=14u
};

struct mqtt_fixed_header {
    enum MQTTControlPacketType control_type;
    uint32_t control_flags: 4;
    uint32_t remaining_length;
};

#define MQTT_PROTOCOL_LEVEL 0x04

#define __ALL_MQTT_ERRORS(MQTT_ERROR)                    \
    MQTT_ERROR(MQTT_ERROR_NULLPTR)                       \
    MQTT_ERROR(MQTT_ERROR_CONTROL_FORBIDDEN_TYPE)        \
    MQTT_ERROR(MQTT_ERROR_CONTROL_INVALID_FLAGS)         \
    MQTT_ERROR(MQTT_ERROR_CONTROL_WRONG_TYPE)            \
    MQTT_ERROR(MQTT_ERROR_CONNECT_CLIENT_ID_REFUSED)     \
    MQTT_ERROR(MQTT_ERROR_CONNECT_NULL_WILL_MESSAGE)     \
    MQTT_ERROR(MQTT_ERROR_CONNECT_FORBIDDEN_WILL_QOS)    \
    MQTT_ERROR(MQTT_ERROR_CONNACK_FORBIDDEN_FLAGS)       \
    MQTT_ERROR(MQTT_ERROR_CONNACK_FORBIDDEN_CODE)        \
    MQTT_ERROR(MQTT_ERROR_PUBLISH_FORBIDDEN_QOS)         \
    MQTT_ERROR(MQTT_ERROR_SUBSCRIBE_TOO_MANY_TOPICS)     \
    MQTT_ERROR(MQTT_ERROR_MALFORMED_RESPONSE)            \
    MQTT_ERROR(MQTT_ERROR_UNSUBSCRIBE_TOO_MANY_TOPICS)   \
    MQTT_ERROR(MQTT_ERROR_RESPONSE_INVALID_CONTROL_TYPE) \
    MQTT_ERROR(MQTT_ERROR_CONNECT_NOT_CALLED)            \
    MQTT_ERROR(MQTT_ERROR_SEND_BUFFER_IS_FULL)           \
    MQTT_ERROR(MQTT_ERROR_SOCKET_ERROR)                  \
    MQTT_ERROR(MQTT_ERROR_MALFORMED_REQUEST)             \
    MQTT_ERROR(MQTT_ERROR_RECV_BUFFER_TOO_SMALL)         \
    MQTT_ERROR(MQTT_ERROR_ACK_OF_UNKNOWN)                \
    MQTT_ERROR(MQTT_ERROR_NOT_IMPLEMENTED)               \
    MQTT_ERROR(MQTT_ERROR_CONNECTION_REFUSED)            \
    MQTT_ERROR(MQTT_ERROR_SUBSCRIBE_FAILED)              \
    MQTT_ERROR(MQTT_ERROR_CONNECTION_CLOSED)             \
    MQTT_ERROR(MQTT_ERROR_INITIAL_RECONNECT)             \
    MQTT_ERROR(MQTT_ERROR_INVALID_REMAINING_LENGTH)      \
    MQTT_ERROR(MQTT_ERROR_CLEAN_SESSION_IS_REQUIRED)     \
    MQTT_ERROR(MQTT_ERROR_RECONNECT_FAILED)              \
    MQTT_ERROR(MQTT_ERROR_RECONNECTING)

#define GENERATE_ENUM(ENUM) ENUM,
#define GENERATE_STRING(STRING) #STRING,

enum MQTTErrors {
    MQTT_ERROR_UNKNOWN=INT_MIN,
    __ALL_MQTT_ERRORS(GENERATE_ENUM)
    MQTT_OK = 1
};

const char* mqtt_error_str(enum MQTTErrors error);
ssize_t __mqtt_pack_uint16(uint8_t *buf, uint16_t integer);
uint16_t __mqtt_unpack_uint16(const uint8_t *buf);
ssize_t __mqtt_pack_str(uint8_t *buf, const char* str);
#define __mqtt_packed_cstrlen(x) (2 + (unsigned int)strlen(x))

enum MQTTConnackReturnCode {
    MQTT_CONNACK_ACCEPTED = 0u,
    MQTT_CONNACK_REFUSED_PROTOCOL_VERSION = 1u,
    MQTT_CONNACK_REFUSED_IDENTIFIER_REJECTED = 2u,
    MQTT_CONNACK_REFUSED_SERVER_UNAVAILABLE = 3u,
    MQTT_CONNACK_REFUSED_BAD_USER_NAME_OR_PASSWORD = 4u,
    MQTT_CONNACK_REFUSED_NOT_AUTHORIZED = 5u
};

struct mqtt_response_connack {
    uint8_t session_present_flag;
    enum MQTTConnackReturnCode return_code;
};

struct mqtt_response_publish {
    uint8_t dup_flag;
    uint8_t qos_level;
    uint8_t retain_flag;
    uint16_t topic_name_size;
    const void* topic_name;
    uint16_t packet_id;
    const void* application_message;
    size_t application_message_size;
};

struct mqtt_response_puback {
    uint16_t packet_id;
};

struct mqtt_response_pubrec {
    uint16_t packet_id;
};

struct mqtt_response_pubrel {
    uint16_t packet_id;
};

struct mqtt_response_pubcomp {
    uint16_t packet_id;
};

enum MQTTSubackReturnCodes {
    MQTT_SUBACK_SUCCESS_MAX_QOS_0 = 0u,
    MQTT_SUBACK_SUCCESS_MAX_QOS_1 = 1u,
    MQTT_SUBACK_SUCCESS_MAX_QOS_2 = 2u,
    MQTT_SUBACK_FAILURE           = 128u
};

struct mqtt_response_suback {
    uint16_t packet_id;
    const uint8_t *return_codes;
    size_t num_return_codes;
};

struct mqtt_response_unsuback {
    uint16_t packet_id;
};

struct mqtt_response_pingresp {
    int dummy;
};

struct mqtt_response {
    struct mqtt_fixed_header fixed_header;
    union {
        struct mqtt_response_connack  connack;
        struct mqtt_response_publish  publish;
        struct mqtt_response_puback   puback;
        struct mqtt_response_pubrec   pubrec;
        struct mqtt_response_pubrel   pubrel;
        struct mqtt_response_pubcomp  pubcomp;
        struct mqtt_response_suback   suback;
        struct mqtt_response_unsuback unsuback;
        struct mqtt_response_pingresp pingresp;
    } decoded;
};

ssize_t mqtt_unpack_fixed_header(struct mqtt_response *response, const uint8_t *buf, size_t bufsz);
ssize_t mqtt_unpack_connack_response (struct mqtt_response *mqtt_response, const uint8_t *buf);
ssize_t mqtt_unpack_publish_response (struct mqtt_response *mqtt_response, const uint8_t *buf);
ssize_t mqtt_unpack_pubxxx_response(struct mqtt_response *mqtt_response, const uint8_t *buf);
ssize_t mqtt_unpack_suback_response(struct mqtt_response *mqtt_response, const uint8_t *buf);
ssize_t mqtt_unpack_unsuback_response(struct mqtt_response *mqtt_response, const uint8_t *buf);
ssize_t mqtt_unpack_response(struct mqtt_response* response, const uint8_t *buf, size_t bufsz);

ssize_t mqtt_pack_fixed_header(uint8_t *buf, size_t bufsz, const struct mqtt_fixed_header *fixed_header);

enum MQTTConnectFlags {
    MQTT_CONNECT_RESERVED = 1u,
    MQTT_CONNECT_CLEAN_SESSION = 2u,
    MQTT_CONNECT_WILL_FLAG = 4u,
    MQTT_CONNECT_WILL_QOS_0 = (0u & 0x03) << 3,
    MQTT_CONNECT_WILL_QOS_1 = (1u & 0x03) << 3,
    MQTT_CONNECT_WILL_QOS_2 = (2u & 0x03) << 3,
    MQTT_CONNECT_WILL_RETAIN = 32u,
    MQTT_CONNECT_PASSWORD = 64u,
    MQTT_CONNECT_USER_NAME = 128u
};

ssize_t mqtt_pack_connection_request(uint8_t* buf, size_t bufsz, const char* client_id, const char* will_topic, const void* will_message, size_t will_message_size, const char* user_name, const char* password, uint8_t connect_flags, uint16_t keep_alive);

enum MQTTPublishFlags {
    MQTT_PUBLISH_DUP = 8u,
    MQTT_PUBLISH_QOS_0 = ((0u << 1) & 0x06),
    MQTT_PUBLISH_QOS_1 = ((1u << 1) & 0x06),
    MQTT_PUBLISH_QOS_2 = ((2u << 1) & 0x06),
    MQTT_PUBLISH_QOS_MASK = ((3u << 1) & 0x06),
    MQTT_PUBLISH_RETAIN = 0x01
};

ssize_t mqtt_pack_publish_request(uint8_t *buf, size_t bufsz, const char* topic_name, uint16_t packet_id, const void* application_message, size_t application_message_size, uint8_t publish_flags);
ssize_t mqtt_pack_pubxxx_request(uint8_t *buf, size_t bufsz, enum MQTTControlPacketType control_type, uint16_t packet_id);

#define MQTT_SUBSCRIBE_REQUEST_MAX_NUM_TOPICS 8

ssize_t mqtt_pack_subscribe_request(uint8_t *buf, size_t bufsz, unsigned int packet_id, ...); /* null terminated */

#define MQTT_UNSUBSCRIBE_REQUEST_MAX_NUM_TOPICS 8

ssize_t mqtt_pack_unsubscribe_request(uint8_t *buf, size_t bufsz, unsigned int packet_id, ...); /* null terminated */
ssize_t mqtt_pack_ping_request(uint8_t *buf, size_t bufsz);
ssize_t mqtt_pack_disconnect(uint8_t *buf, size_t bufsz);


enum MQTTQueuedMessageState {
    MQTT_QUEUED_UNSENT,
    MQTT_QUEUED_AWAITING_ACK,
    MQTT_QUEUED_COMPLETE
};

struct mqtt_queued_message {
    uint8_t *start;
    size_t size;
    enum MQTTQueuedMessageState state;
    mqtt_pal_time_t time_sent;
    enum MQTTControlPacketType control_type;
    uint16_t packet_id;
};

struct mqtt_message_queue {
    void *mem_start;
    void *mem_end;
    uint8_t *curr;
    size_t curr_sz;
    struct mqtt_queued_message *queue_tail;
};

void mqtt_mq_init(struct mqtt_message_queue *mq, void *buf, size_t bufsz);
void mqtt_mq_clean(struct mqtt_message_queue *mq);
struct mqtt_queued_message* mqtt_mq_register(struct mqtt_message_queue *mq, size_t nbytes);
struct mqtt_queued_message* mqtt_mq_find(const struct mqtt_message_queue *mq, enum MQTTControlPacketType control_type, const uint16_t *packet_id);
#define mqtt_mq_get(mq_ptr, index) (((struct mqtt_queued_message*) ((mq_ptr)->mem_end)) - 1 - index)
#define mqtt_mq_length(mq_ptr) (((struct mqtt_queued_message*) ((mq_ptr)->mem_end)) - (mq_ptr)->queue_tail)
#define mqtt_mq_currsz(mq_ptr) (((mq_ptr)->curr >= (uint8_t*) ((mq_ptr)->queue_tail - 1)) ? 0 : ((uint8_t*) ((mq_ptr)->queue_tail - 1)) - (mq_ptr)->curr)

struct mqtt_client {
    mqtt_pal_handle handle;
    uint16_t pid_lfsr;
    uint16_t keep_alive;
    int number_of_keep_alives;
    size_t send_offset;
    mqtt_pal_time_t time_of_last_send;
    enum MQTTErrors error;
    int response_timeout;
    int number_of_timeouts;
    float typical_response_time;
    void (*publish_response_callback)(void** state, struct mqtt_response_publish *publish);
    void* publish_response_callback_state;
    enum MQTTErrors (*inspector_callback)(struct mqtt_client*);
    void (*reconnect_callback)(struct mqtt_client*, void**);
    void* reconnect_state;
    struct {
        uint8_t *mem_start;
        size_t mem_size;
        uint8_t *curr;
        size_t curr_sz;
    } recv_buffer;
    struct mqtt_message_queue mq;
};

uint16_t __mqtt_next_pid(struct mqtt_client *client);
ssize_t __mqtt_send(struct mqtt_client *client);
ssize_t __mqtt_recv(struct mqtt_client *client);

enum MQTTErrors mqtt_sync(struct mqtt_client *client);

enum MQTTErrors mqtt_init(struct mqtt_client *client, mqtt_pal_handle handle, uint8_t *sendbuf, size_t sendbufsz, uint8_t *recvbuf, size_t recvbufsz, void (*publish_response_callback)(void** state, struct mqtt_response_publish *publish));
void mqtt_init_reconnect(struct mqtt_client *client, void (*reconnect_callback)(struct mqtt_client *client, void** state), void *reconnect_state, void (*publish_response_callback)(void** state, struct mqtt_response_publish *publish));
void mqtt_reinit(struct mqtt_client* client, mqtt_pal_handle handle, uint8_t *sendbuf, size_t sendbufsz, uint8_t *recvbuf, size_t recvbufsz);
enum MQTTErrors mqtt_connect(struct mqtt_client *client, const char* client_id, const char* will_topic, const void* will_message, size_t will_message_size, const char* user_name, const char* password, uint8_t connect_flags, uint16_t keep_alive);

enum MQTTErrors mqtt_publish(struct mqtt_client *client, const char* topic_name, const void* application_message, size_t application_message_size, uint8_t publish_flags);
ssize_t __mqtt_puback(struct mqtt_client *client, uint16_t packet_id);
ssize_t __mqtt_pubrec(struct mqtt_client *client, uint16_t packet_id);
ssize_t __mqtt_pubrel(struct mqtt_client *client, uint16_t packet_id);
ssize_t __mqtt_pubcomp(struct mqtt_client *client, uint16_t packet_id);

enum MQTTErrors mqtt_subscribe(struct mqtt_client *client, const char* topic_name, int max_qos_level);
enum MQTTErrors mqtt_unsubscribe(struct mqtt_client *client, const char* topic_name);

enum MQTTErrors mqtt_ping(struct mqtt_client *client);
enum MQTTErrors __mqtt_ping(struct mqtt_client *client);

enum MQTTErrors mqtt_disconnect(struct mqtt_client *client);

enum MQTTErrors mqtt_reconnect(struct mqtt_client *client);

#if defined(__cplusplus)
}
#endif

#endif
