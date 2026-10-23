"""Asterisk Manager Interface client.

Talks to a running Asterisk process. It never reads or writes core/asterisk.
"""

from __future__ import annotations

import socket
from typing import Iterable


class AmiError(Exception):
    pass


def parse_packet(raw: bytes) -> dict[str, str | list[str]]:
    packet: dict[str, str | list[str]] = {}
    for line in raw.decode("utf-8", "replace").split("\r\n"):
        if ": " not in line:
            continue
        key, value = line.split(": ", 1)
        current = packet.get(key)
        if current is None:
            packet[key] = value
        elif isinstance(current, list):
            current.append(value)
        else:
            packet[key] = [current, value]
    return packet


def output_text(packet: dict[str, str | list[str]]) -> str:
    output = packet.get("Output", "")
    if isinstance(output, list):
        return "\n".join(output).strip()
    return str(output).strip()


class AmiSession:
    def __init__(self, sock: socket.socket):
        self.sock = sock
        self.buf = b""

    def send(self, fields: dict[str, str]) -> None:
        payload = "".join(f"{key}: {value}\r\n" for key, value in fields.items()) + "\r\n"
        self.sock.sendall(payload.encode("utf-8"))

    def read(self) -> dict[str, str | list[str]]:
        while b"\r\n\r\n" not in self.buf:
            try:
                chunk = self.sock.recv(8192)
            except socket.timeout as error:
                raise AmiError("هسته در زمان مقرر پاسخ نداد") from error
            if not chunk:
                raise AmiError("ارتباط با هسته قطع شد")
            self.buf += chunk
        raw, self.buf = self.buf.split(b"\r\n\r\n", 1)
        return parse_packet(raw)

    def read_response(self) -> dict[str, str | list[str]]:
        while True:
            packet = self.read()
            if "Response" in packet:
                if packet.get("Response") == "Error":
                    message = packet.get("Message", "هسته درخواست را رد کرد")
                    raise AmiError(message if isinstance(message, str) else "هسته درخواست را رد کرد")
                return packet

    def request(self, fields: dict[str, str]) -> dict[str, str | list[str]]:
        self.send(fields)
        return self.read_response()

    def collect(self, fields: dict[str, str], complete_event: str) -> list[dict[str, str | list[str]]]:
        self.send(fields)
        events: list[dict[str, str | list[str]]] = []
        self.read_response()
        while True:
            packet = self.read()
            event = packet.get("Event")
            if event == complete_event:
                return events
            if event:
                events.append(packet)


def connect(host: str, port: int, username: str, secret: str, timeout: float = 3) -> tuple[AmiSession, str]:
    try:
        sock = socket.create_connection((host, int(port)), timeout)
    except OSError as error:
        raise AmiError("هسته در این آدرس در دسترس نیست") from error
    sock.settimeout(timeout)
    session = AmiSession(sock)
    try:
        banner = _read_banner(session)
    except AmiError:
        sock.close()
        raise
    try:
        session.request({"Action": "Login", "Username": username, "Secret": secret})
    except AmiError:
        sock.close()
        raise AmiError("ورود به هسته رد شد. نام کاربری یا رمز درگاه مدیریت نادرست است")
    return session, banner


def _read_banner(session: AmiSession) -> str:
    while b"\r\n" not in session.buf:
        try:
            chunk = session.sock.recv(256)
        except socket.timeout as error:
            raise AmiError("هسته پاسخ ورود نداد") from error
        if not chunk:
            raise AmiError("هسته پاسخ ورود نداد")
        session.buf += chunk
    line, session.buf = session.buf.split(b"\r\n", 1)
    banner = line.decode("utf-8", "replace").strip()
    if "Asterisk Call Manager" not in banner:
        raise AmiError("این آدرس درگاه مدیریت Asterisk نیست")
    return banner


def close(session: AmiSession) -> None:
    try:
        session.send({"Action": "Logoff"})
    except OSError:
        pass
    session.sock.close()


def update_config_fields(filename: str, categories: Iterable[tuple[str, list[tuple[str, str]]]]) -> dict[str, str]:
    fields = {
        "Action": "UpdateConfig",
        "SrcFilename": filename,
        "DstFilename": filename,
        "Reload": "yes",
    }
    index = 0
    for name, pairs in categories:
        fields[f"Action-{index:06d}"] = "NewCat"
        fields[f"Cat-{index:06d}"] = name
        index += 1
        for var, value in pairs:
            fields[f"Action-{index:06d}"] = "Append"
            fields[f"Cat-{index:06d}"] = name
            fields[f"Var-{index:06d}"] = var
            fields[f"Value-{index:06d}"] = value
            index += 1
    return fields
