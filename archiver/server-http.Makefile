
SYSTEM=weather
SUBSYS=archiver-
TARGET=../server/http/server-archiver.js

##

prettier:
	prettier --write *.js
lint:
	eslint *.js
test:
	node $(TARGET)
.PHONY: prettier lint test

##

SYSTEMD_DIR = /etc/systemd/system
define install_systemd_depend
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

install_storage: storage.service
	$(call install_systemd_depend,$(SYSTEM)-$(SUBSYS)storage,storage)
install_server: server-http.service
	$(call install_systemd_service,$(SYSTEM)-$(SUBSYS)server-http,server-http)
restart_server:
	-systemctl restart $(SYSTEM)-$(SUBSYS)server-http 2>/dev/null || true

##

install_service: install_storage install_server
restart_service: restart_server

##

install: install_service
restart: restart_service
deploy: restart
	@echo "Deployment completed"

##

.PHONY: install_service install_storage install_server \
	restart_service \
	install restart deploy
