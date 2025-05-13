
SYSTEM=http
TARGET=server-mainview.js

##

prettier:
	prettier --write *.js ../assets/js/*.js ../assets/css/*.css
lint:
	eslint --no-ignore *.js ../assets/js/*.js
test:
	node $(TARGET)
.PHONY: prettier lint test

##

