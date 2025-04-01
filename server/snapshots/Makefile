
CC = gcc
CFLAGS = -O6 -Wall -Wpedantic -Wextra
LDFLAGS = -lmosquitto
SYSTEM = snapshots
TARGET = publisher

##

$(TARGET): $(TARGET).c
	$(CC) $(CFLAGS) -o $(TARGET) $(TARGET).c $(LDFLAGS)
all: $(TARGET)
clean:
	rm -f $(TARGET)
format:
	clang-format -i $(TARGET).c
test: $(TARGET)
	./publisher ../secrets.txt
.PHONY: all clean format test

##

SYSTEMD_DIR = /etc/systemd/system
define install_systemd_service
	-systemctl stop $(1) 2>/dev/null || true
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1)
	systemctl daemon-reload
	systemctl enable $(1)
	systemctl start $(1) || echo "Warning: Failed to start $(1)"
endef
install_target: $(TARGET).service
	$(call install_systemd_service,$(SYSTEM)-$(TARGET),$(TARGET))
install: install_target
.PHONY: install install_target

