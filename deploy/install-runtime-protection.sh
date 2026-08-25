#!/data/data/com.termux/files/usr/bin/sh
set -e
command -v tmux >/dev/null || pkg install -y tmux
command -v termux-wake-lock >/dev/null || pkg install -y termux-api
command -v sv >/dev/null || pkg install -y termux-services
ROOT="$HOME/silent-giants"
mkdir -p "$PREFIX/var/service/silent-giants" "$HOME/.termux/boot" "$ROOT/logs"
cat > "$PREFIX/var/service/silent-giants/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
cd "$ROOT"
exec bash "$ROOT/deploy/termux-persistent.sh" --foreground
RUN
chmod +x "$PREFIX/var/service/silent-giants/run"
cp "$ROOT/deploy/termux-boot.sh" "$HOME/.termux/boot/aurora-silent-giants"
chmod +x "$HOME/.termux/boot/aurora-silent-giants"
sv down silent-giants >/dev/null 2>&1 || true
sv up silent-giants
termux-wake-lock
printf 'تم تفعيل حماية تشغيل أورورا الدائمة.\n'
