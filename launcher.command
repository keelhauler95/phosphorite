#!/usr/bin/env bash
# Phosphorite Launcher for macOS (double-click from Finder)
# Simply invokes the Node.js bootstrap script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/scripts/bootstrap.js"

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    # Ask user if they want to install Node.js
    response=$(osascript -e 'tell app "System Events" to display dialog "Node.js is not installed!\n\nWould you like to install it automatically using Homebrew?" buttons {"Cancel", "Install"} default button 2 with icon caution')
    
    if [[ "$response" == *"Install"* ]]; then
        # Check if Homebrew is installed
        if ! command -v brew >/dev/null 2>&1; then
            osascript -e 'tell app "System Events" to display dialog "Homebrew is not installed.\n\nPlease install Homebrew first:\n/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"\n\nOr install Node.js manually from https://nodejs.org" buttons {"OK"} default button 1 with icon stop'
            exit 1
        fi
        
        # Install Node.js via Homebrew
        osascript -e 'tell app "System Events" to display dialog "Installing Node.js via Homebrew...\n\nThis may take a few minutes." buttons {"OK"} default button 1 with icon note giving up after 3'
        
        # Run installation in a terminal
        osascript <<EOF
tell application "Terminal"
    activate
    do script "echo 'Installing Node.js...' && brew install node && echo '' && echo 'Node.js installed successfully!' && echo 'Please close this window and run the launcher again.' && read -rp 'Press ENTER to close...'"
end tell
EOF
        exit 0
    else
        osascript -e 'tell app "System Events" to display dialog "Please install Node.js from https://nodejs.org and try again." buttons {"OK"} default button 1 with icon stop'
        exit 1
    fi
fi

# Check if bootstrap.js exists
if [[ ! -f "$BOOTSTRAP_SCRIPT" ]]; then
    osascript -e "tell app \"System Events\" to display dialog \"Error: Could not find bootstrap script at:\n$BOOTSTRAP_SCRIPT\" buttons {\"OK\"} default button 1 with icon stop"
    exit 1
fi

# Launch the bootstrap script in a new terminal window
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$SCRIPT_DIR' && node '$BOOTSTRAP_SCRIPT'"
end tell
EOF
