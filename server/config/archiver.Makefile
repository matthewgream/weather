
SYSTEM=weather

##

SYSTEMD_DIR = /etc/systemd/system
define install_systemd_depend
	-systemctl stop $(1) 2>/dev/null || true
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	systemctl daemon-reload
	systemctl enable $(1)
endef
define install_systemd_service
	-systemctl stop $(1) 2>/dev/null || true
	-systemctl disable $(1) 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	systemctl daemon-reload
	systemctl enable $(1)
	systemctl start $(1) || echo "Warning: Failed to start $(1)"
endef

##

install_storage: archiver-storage.service
	$(call install_systemd_depend,$(SYSTEM)-archiver-storage,archiver-storage)
install_server: archiver-server-http.service
	$(call install_systemd_service,$(SYSTEM)-archiver-server-http,archiver-server-http)
restart_server:
	-systemctl restart $(SYSTEM)-archiver-server-http 2>/dev/null || true

##

install_service: install_storage install_server
restart_service: restart_server

##

install: install_service
restart: restart_service

##

.PHONY: install_storage install_server restart_server \
	install_service restart_service \
	install restart

##

