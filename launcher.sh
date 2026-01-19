#!/usr/bin/env bash
# Phosphorite Launcher for macOS and Linux
# Simply invokes the Node.js bootstrap script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/scripts/bootstrap.js"

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed!"
    echo ""
    
    # Offer to install Node.js
    read -rp "Would you like to install it automatically? (Y/N): " install_choice
    
    if [[ "$install_choice" =~ ^[Yy]$ ]]; then
        # Detect OS and package manager
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS - use Homebrew
            if command -v brew >/dev/null 2>&1; then
                echo ""
                echo "Installing Node.js via Homebrew..."
                brew install node
                
                if [ $? -eq 0 ]; then
                    echo ""
                    echo "Node.js installed successfully! Please restart this launcher."
                else
                    echo ""
                    echo "Installation failed. Please install Node.js manually from https://nodejs.org"
                fi
            else
                echo ""
                echo "Homebrew not found. Please install it first:"
                echo "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                echo ""
                echo "Or install Node.js manually from https://nodejs.org"
            fi
        elif command -v apt-get >/dev/null 2>&1; then
            # Debian/Ubuntu
            echo ""
            echo "Installing Node.js via apt..."
            echo "This requires sudo privileges."
            sudo apt-get update && sudo apt-get install -y nodejs npm
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "Node.js installed successfully! Please restart this launcher."
            else
                echo ""
                echo "Installation failed. Please install Node.js manually from https://nodejs.org"
            fi
        elif command -v dnf >/dev/null 2>&1; then
            # Fedora
            echo ""
            echo "Installing Node.js via dnf..."
            echo "This requires sudo privileges."
            sudo dnf install -y nodejs npm
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "Node.js installed successfully! Please restart this launcher."
            else
                echo ""
                echo "Installation failed. Please install Node.js manually from https://nodejs.org"
            fi
        elif command -v yum >/dev/null 2>&1; then
            # CentOS/RHEL
            echo ""
            echo "Installing Node.js via yum..."
            echo "This requires sudo privileges."
            sudo yum install -y nodejs npm
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "Node.js installed successfully! Please restart this launcher."
            else
                echo ""
                echo "Installation failed. Please install Node.js manually from https://nodejs.org"
            fi
        elif command -v pacman >/dev/null 2>&1; then
            # Arch Linux
            echo ""
            echo "Installing Node.js via pacman..."
            echo "This requires sudo privileges."
            sudo pacman -S --noconfirm nodejs npm
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "Node.js installed successfully! Please restart this launcher."
            else
                echo ""
                echo "Installation failed. Please install Node.js manually from https://nodejs.org"
            fi
        else
            echo ""
            echo "Could not detect a supported package manager."
            echo "Please install Node.js manually from https://nodejs.org"
        fi
        
        echo ""
        read -rp "Press ENTER to exit..."
        exit 0
    else
        echo ""
        echo "Please install Node.js from https://nodejs.org and try again."
        echo ""
        read -rp "Press ENTER to exit..."
        exit 1
    fi
fi

# Check if bootstrap.js exists
if [[ ! -f "$BOOTSTRAP_SCRIPT" ]]; then
    echo "Error: Could not find bootstrap script at $BOOTSTRAP_SCRIPT"
    read -rp "Press ENTER to exit..."
    exit 1
fi

# Launch the bootstrap script
node "$BOOTSTRAP_SCRIPT"
