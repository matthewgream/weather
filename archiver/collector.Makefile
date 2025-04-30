
SYSTEM=weather
SUBSYS=archiver-
TARGET=collector.js
INSTALL_FILES=""
INSTALL_LIBS="collector-functions.js collector-mqtt.js collector-messages.js collector-snapshots.js"

##

INSTALL_DIR=/opt/bin/$(SYSTEM)
NODE_MODULES_DIR=$(INSTALL_DIR)/node_modules

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
define install_systemd_timer
	-systemctl stop $(1).timer 2>/dev/null || true
	-systemctl disable $(1).timer 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	cp $(2).timer $(SYSTEMD_DIR)/$(1).timer
	systemctl daemon-reload
	systemctl enable $(1).timer
	systemctl start $(1).timer || echo "Warning: Failed to start $(1).timer"
endef

##

install_js_dir:
	mkdir -p $(INSTALL_DIR)
install_js_files: install_js_dir
	cp -f $(TARGET) $(INSTALL_DIR)/$(SYSTEM)-$(SUBSYS)$(TARGET)
	chmod +x $(INSTALL_DIR)/$(SYSTEM)-$(SUBSYS)$(TARGET)
	for file in "$(INSTALL_FILES)"; do \
		if [ -f "$$file" ]; then \
			cp -f "$$file" "$(INSTALL_DIR)/$(SYSTEM)-$(SUBSYS)$$file"; \
			chmod +x "$(INSTALL_DIR)/$(SYSTEM)-$(SUBSYS)$$file"; \
		fi; \
	done
install_js_libs: install_js_dir
	for lib in "$(INSTALL_LIBS)"; do \
		if [ -f "$$lib" ]; then \
			cp -f "$$lib" "$(INSTALL_DIR)/"; \
		fi; \
	done
install_js_npm: install_js_dir
	cp -f package.json $(INSTALL_DIR)/
	cd $(INSTALL_DIR) && npm install --omit=dev

##

install_storage: storage.service
	$(call install_systemd_depend,$(SYSTEM)-$(SUBSYS)storage,storage)
install_collector: collector.service
	$(call install_systemd_service,$(SYSTEM)-$(SUBSYS)collector,collector)
install_periodic: periodic.service periodic.timer
	$(call install_systemd_timer,$(SYSTEM)-$(SUBSYS)periodic,periodic)
restart_collector:
	-systemctl restart $(SYSTEM)-$(SUBSYS)collector 2>/dev/null || true
restart_periodic:
	-systemctl restart $(SYSTEM)-$(SUBSYS)periodic.timer 2>/dev/null || true

##

install_source: install_js_files install_js_libs install_js_npm
install_service: install_storage install_collector
restart_service: restart_collector

install: install_source install_service
update: install_source
restart: restart_service
deploy: update restart
	@echo "Deployment completed"
clean:
	rm -rf $(INSTALL_DIR)/*.js

##

.PHONY: install_service install_storage install_collector install_periodic \
	install_source install_js_dir install_js_files install_js_libs install_js_npm \
	restart_service restart_collector restart_periodic \
	install update restart deploy clean
