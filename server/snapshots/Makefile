
CC = gcc
CFLAGS = -O6 -Wall -Wpedantic -Wextra
LDFLAGS = -lmosquitto
TARGET = publisher

$(TARGET): $(TARGET).c
	$(CC) $(CFLAGS) -o $(TARGET) $(TARGET).c $(LDFLAGS)

all: $(TARGET)

clean:
	rm -f $(TARGET)

format:
	clang-format -i $(TARGET).c

install: $(TARGET)
	cp $(TARGET).service /etc/systemd/system/snapshots-$(TARGET).service
	systemctl daemon-reload
	systemctl enable snapshots-$(TARGET)
	systemctl start snapshots-$(TARGET)

test: $(TARGET)
	./publisher ../secrets.txt

.PHONY: all clean format


