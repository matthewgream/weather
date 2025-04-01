
SYSTEM=weather

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
define install_systemd_timer
	-systemctl stop $(1).timer 2>/dev/null || true
	-systemctl disable $(1).timer 2>/dev/null || true
	cp $(2).service $(SYSTEMD_DIR)/$(1).service
	cp $(2).timer $(SYSTEMD_DIR)/$(1).timer
	systemctl daemon-reload
	systemctl enable $(1).timer
	systemctl start $(1).timer || echo "Warning: Failed to start $(1).timer"
endef
install_daily: daily.service daily.timer
	$(call install_systemd_timer,$(SYSTEM)-daily,daily)
install_server: server-http.service
	$(call install_systemd_service,$(SYSTEM)-server-http,server-http)
install_ecowitt2mqtt_service: ecowitt2mqtt.service
	$(call install_systemd_service,ecowitt2mqtt,ecowitt2mqtt)
install_ecowitt2mqtt_config: ecowitt2mqtt.default
	cp ecowitt2mqtt.default /etc/default/ecowitt2mqtt
	systemctl reload ecowitt2mqtt
install_ecowitt2mqtt: install_ecowitt2mqtt_config install_ecowitt2mqtt_service
install_mosquitto_config: mosquitto.conf
	cp mosquitto.conf /etc/mosquitto/conf.d/ecowitt2mqtt.conf
	systemctl reload mosquitto
install_mosquitto: install_mosquitto_config
install: install_mosquitto install_ecowitt2mqtt install_daily install_server
.PHONY: install_mosquitto install_mosquitto_config
.PHONY: install_ecowitt2mqtt install_ecowitt2mqtt_config install_ecowitt2mqtt_service
.PHONY: install_daily install_server
.PHONY: install

