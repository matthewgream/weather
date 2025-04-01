
SYSTEM=archiver
TARGET=collector.js

##

prettier:
	prettier --write $(TARGET)
lint:
	eslint $(TARGET)
test:
	node $(TARGET)
.PHONY: prettier lint test

##

SYSTEMD_DIR = /etc/systemd/system
define install_systemd_depend
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1)
	systemctl daemon-reload
	systemctl enable $(1)
endef
define install_systemd_service
	-systemctl stop $(1) 2>/dev/null || true
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1)
	systemctl daemon-reload
	systemctl enable $(1)
	systemctl start $(1) || echo "Warning: Failed to start $(1)"
endef
define install_systemd_timer
	-systemctl stop $(1).timer 2>/dev/null || true
	-systemctl disable $(1).timer 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	cp $(2).timer $(SYSTEMD_DIR)/$(1).timer
	systemctl daemon-reload
	systemctl enable $(1).timer
	systemctl start $(1).timer || echo "Warning: Failed to start $(1).timer"
endef
install_storage: storage.service
	$(call install_systemd_depend,$(SYSTEM)-storage,storage)
install_collector: collector.service
	$(call install_systemd_service,$(SYSTEM)-collector,collector)
install_collector_snapshots: collector-snapshots-fetcher.service  collector-snapshots-fetcher.timer
	$(call install_systemd_timer,$(SYSTEM)-collector-snapshots-fetcher,collector-snapshots-fetcher)
install_server: server-http.service
	$(call install_systemd_service,$(SYSTEM)-server-http,server-http)
install: install_storage install_server install_collector install_collector_snapshots
.PHONY: install install_storage install_server install_collector install_collector_snapshots

