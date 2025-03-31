
CC = gcc
CFLAGS = -O6 -Wall
LDFLAGS = -lmosquitto -lpthread
TARGET = publisher

$(TARGET): $(TARGET).c
	$(CC) $(CFLAGS) -o $(TARGET) $(TARGET).c $(LDFLAGS)

all: $(TARGET)

clean:
	rm -f $(TARGET)

format:
	clang-format -i $(TARGET).c

install:
	cp $(TARGET).service /etc/systemd/system/snapshots-$(TARGET).service
	systemctl daemon-reload
	systemctl enable snapshots-$(TARGET)
	systemctl start snapshots-$(TARGET)

.PHONY: all clean format


