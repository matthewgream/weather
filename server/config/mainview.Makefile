
SYSTEM=weather

##

SYSTEMD_DIR = /etc/systemd/system
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

install_start: mainview-start.service
	$(call install_systemd_service,$(SYSTEM)-mainview-start,mainview-start)
install_daily: mainview-daily.service mainview-daily.timer
	$(call install_systemd_timer,$(SYSTEM)-mainview-daily,mainview-daily)
install_server: mainview-server-http.service
	$(call install_systemd_service,$(SYSTEM)-mainview-server-http,mainview-server-http)
restart_server:
	-systemctl restart $(SYSTEM)-mainview-server-http 2>/dev/null || true

install_ecowitt2mqtt_service: ecowitt2mqtt.service
	$(call install_systemd_service,$(SYSTEM)-ecowitt2mqtt,ecowitt2mqtt)
install_ecowitt2mqtt_config: ecowitt2mqtt.default
	cp ecowitt2mqtt.default /etc/default/ecowitt2mqtt
	systemctl reload ecowitt2mqtt
install_ecowitt2mqtt: install_ecowitt2mqtt_config install_ecowitt2mqtt_service

install_mosquitto_config: mosquitto.conf
	cp mosquitto.conf /etc/mosquitto/conf.d/$(SYSTEM)-ecowitt2mqtt.conf
	systemctl reload mosquitto
install_mosquitto: install_mosquitto_config

install_service: install_start install_daily install_server
restart_service: restart_server

install: install_mosquitto install_ecowitt2mqtt install_service
restart: restart_service

##

.PHONY: install_mosquitto install_mosquitto_config
.PHONY: install_ecowitt2mqtt install_ecowitt2mqtt_config install_ecowitt2mqtt_service
.PHONY: install_start install_daily install_server restart_server
.PHONY: install_service restart_service
.PHONY: install restart

##

