
#ifndef JSON_H
#define JSON_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef const char * json_string_t;
typedef int json_length_t;

typedef enum {
  JSON_UNDEFINED = 0,
  JSON_OBJECT = 1 << 0, // Object
  JSON_ARRAY = 1 << 1, // Array
  JSON_STRING = 1 << 2, // String
  JSON_PRIMITIVE = 1 << 3 // number, boolean (true/false) or null
} json_type_t;

typedef enum {
  JSON_ERROR_NOMEM = -1, /* Not enough tokens were provided */
  JSON_ERROR_INVAL = -2, /* Invalid character inside JSON string */
  JSON_ERROR_PART = -3 /* The string is not a full JSON packet, more bytes expected */
} json_error_t;

typedef struct jsontok {
  json_type_t type; // type (object, array, string etc.)
  int start; // start position in JSON data string
  int end; // end position in JSON data string
  int size;
} json_token_t;

typedef struct json_parser_t {
  unsigned int pos;     /* offset in the JSON string */
  unsigned int toknext; /* next token to allocate */
  int toksuper;         /* superior token node, e.g. parent object or array */
} json_parser_t;

static json_token_t *json_alloc_token(json_parser_t *parser, json_token_t *tokens, const size_t num_tokens) {
  if (parser->toknext >= num_tokens)
    return NULL;
  json_token_t *tok = &tokens[parser->toknext++];
  tok->start = tok->end = -1;
  tok->size = 0;
  return tok;
}
static void json_fill_token(json_token_t *token, const json_type_t type, const int start, const int end) {
  token->type = type;
  token->start = start;
  token->end = end;
  token->size = 0;
}
static int json_parse_primitive(json_parser_t *parser, const char *js, const size_t len, json_token_t *tokens, const size_t num_tokens) {
  int start = parser->pos;
  for (; parser->pos < len && js[parser->pos] != '\0'; parser->pos++) {
    switch (js[parser->pos]) {
    case '\t':
    case '\r':
    case '\n':
    case ' ':
    case ',':
    case ']':
    case '}':
      goto found;
    default:
      break;
    }
    if (js[parser->pos] < 32 || js[parser->pos] >= 127) {
      parser->pos = start;
      return JSON_ERROR_INVAL;
    }
  }
found:
  if (tokens == NULL) {
    parser->pos--;
    return 0;
  }
  json_token_t *token = json_alloc_token(parser, tokens, num_tokens);
  if (token == NULL) {
    parser->pos = start;
    return JSON_ERROR_NOMEM;
  }
  json_fill_token(token, JSON_PRIMITIVE, start, parser->pos);
  parser->pos--;
  return 0;
}

static int json_parse_string(json_parser_t *parser, const char *js, const size_t len, json_token_t *tokens, const size_t num_tokens) {
  int start = parser->pos;
  parser->pos++;
  for (; parser->pos < len && js[parser->pos] != '\0'; parser->pos++) {
    char c = js[parser->pos];
    if (c == '\"') {
      if (tokens == NULL)
        return 0;
      json_token_t *token = json_alloc_token(parser, tokens, num_tokens);
      if (token == NULL) {
        parser->pos = start;
        return JSON_ERROR_NOMEM;
      }
      json_fill_token(token, JSON_STRING, start + 1, parser->pos);
      return 0;
    }
    if (c == '\\' && parser->pos + 1 < len) {
      int i;
      parser->pos++;
      switch (js[parser->pos]) {
      case '\"':
      case '/':
      case '\\':
      case 'b':
      case 'f':
      case 'r':
      case 'n':
      case 't':
        break;
      case 'u':
        parser->pos++;
        for (i = 0; i < 4 && parser->pos < len && js[parser->pos] != '\0'; i++) {
          if (!((js[parser->pos] >= 48 && js[parser->pos] <= 57) || (js[parser->pos] >= 65 && js[parser->pos] <= 70) || (js[parser->pos] >= 97 && js[parser->pos] <= 102))) {
            parser->pos = start;
            return JSON_ERROR_INVAL;
          }
          parser->pos++;
        }
        parser->pos--;
        break;
      default:
        parser->pos = start;
        return JSON_ERROR_INVAL;
      }
    }
  }
  parser->pos = start;
  return JSON_ERROR_PART;
}

extern int json_parse(json_parser_t *parser, const char *js, const size_t len, json_token_t *tokens, const unsigned int num_tokens) {
  int count = parser->toknext;
  int r, i;
  for (; parser->pos < len && js[parser->pos] != '\0'; parser->pos++) {
    json_token_t *token;
    char c = js[parser->pos];
    switch (c) {
    case '{':
    case '[':
      count++;
      if (tokens == NULL)
        break;
      token = json_alloc_token(parser, tokens, num_tokens);
      if (token == NULL)
        return JSON_ERROR_NOMEM;
      if (parser->toksuper != -1) {
        json_token_t *t = &tokens[parser->toksuper];
        t->size++;
      }
      token->type = (c == '{' ? JSON_OBJECT : JSON_ARRAY);
      token->start = parser->pos;
      parser->toksuper = parser->toknext - 1;
      break;
    case '}':
    case ']':
      if (tokens == NULL)
        break;
      json_type_t type = (c == '}' ? JSON_OBJECT : JSON_ARRAY);
      for (i = parser->toknext - 1; i >= 0; i--) {
        token = &tokens[i];
        if (token->start != -1 && token->end == -1) {
          if (token->type != type)
            return JSON_ERROR_INVAL;
          parser->toksuper = -1;
          token->end = parser->pos + 1;
          break;
        }
      }
      if (i == -1)
        return JSON_ERROR_INVAL;
      for (; i >= 0; i--) {
        token = &tokens[i];
        if (token->start != -1 && token->end == -1) {
          parser->toksuper = i;
          break;
        }
      }
      break;
    case '\"':
      r = json_parse_string(parser, js, len, tokens, num_tokens);
      if (r < 0)
        return r;
      count++;
      if (parser->toksuper != -1 && tokens != NULL)
        tokens[parser->toksuper].size++;
      break;
    case '\t':
    case '\r':
    case '\n':
    case ' ':
      break;
    case ':':
      parser->toksuper = parser->toknext - 1;
      break;
    case ',':
      if (tokens != NULL && parser->toksuper != -1 && tokens[parser->toksuper].type != JSON_ARRAY && tokens[parser->toksuper].type != JSON_OBJECT)
        for (i = parser->toknext - 1; i >= 0; i--)
          if (tokens[i].type == JSON_ARRAY || tokens[i].type == JSON_OBJECT)
            if (tokens[i].start != -1 && tokens[i].end == -1) {
              parser->toksuper = i;
              break;
            }
      break;
    default:
      r = json_parse_primitive(parser, js, len, tokens, num_tokens);
      if (r < 0)
        return r;
      count++;
      if (parser->toksuper != -1 && tokens != NULL)
        tokens[parser->toksuper].size++;
      break;
    }
  }
  if (tokens != NULL)
    for (i = parser->toknext - 1; i >= 0; i--)
      if (tokens[i].start != -1 && tokens[i].end == -1)
        return JSON_ERROR_PART;
  return count;
}

extern void json_init(json_parser_t *parser) {
  parser->pos = 0;
  parser->toknext = 0;
  parser->toksuper = -1;
}

#ifdef __cplusplus
}
#endif

#endif /* JSON_H */
