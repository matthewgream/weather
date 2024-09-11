#!/usr/bin/env python3

import socket
import struct
import time

CMD_HEAD = 0xffff
CMD_BCAST = 0x12
PORT_BCAST = 46000
DURATION = 15

def _csum(data):
    if isinstance(data, int):
        data = [data]
    csum = 0
    for d in data:
        csum += d
    return csum & 0xff

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(1)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
devices = {}
start_time = time.time()
while time.time() - start_time < DURATION:
    sock.sendto(struct.pack('!H3B', CMD_HEAD, CMD_BCAST, 3, _csum(CMD_BCAST + 3)), ('255.255.255.255', PORT_BCAST))
    try:
        data, addr = sock.recvfrom(1024)
        if len(data) > 40:
            macc = ':'.join([f'{b:02x}' for b in data[5:11]])
            addr = socket.inet_ntoa(struct.unpack('!4s', data[11:15])[0])
            port = struct.unpack('!H', data[15:17])[0]
            name = data[18:-1].decode('ascii')
            if addr not in devices:
                devices[addr] = (name, port)
                print(f"Device: {name}, MAC: {macc}, IP: {addr}, Port: {port}")
    except socket.timeout:
        pass

