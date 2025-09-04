#!/bin/bash

echo "🔓 Opening port 3001 for external access..."

# macOS 방화벽 규칙 추가 (pfctl 사용)
echo "Adding firewall rule..."
echo "rdr pass inet proto tcp from any to any port 3001 -> 127.0.0.1 port 3001" | sudo pfctl -ef -

# 또는 macOS 앱 방화벽 비활성화 (임시)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

echo "✅ Port 3001 should now be accessible from external network"
echo ""
echo "⚠️  Important:"
echo "1. Make sure your router/modem allows port 3001"
echo "2. You may need to set up port forwarding on your router"
echo "3. Your public IP is needed for external access"
echo ""
echo "To check your public IP:"
curl -s ifconfig.me
echo ""
echo ""
echo "To close the port later, run:"
echo "sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on"