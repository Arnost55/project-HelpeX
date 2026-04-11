"""
HelpeX Web UI - Flask application for live message feed and skill controls.
"""
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import threading
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
socketio = SocketIO(app, cors_allowed_origins="*")

# Message feed storage (in-memory for now)
message_feed = []
max_feed_size = 100


def add_message(msg_type, content, source=None):
    """Add a message to the feed and broadcast to connected clients."""
    message = {
        'type': msg_type,
        'content': content,
        'source': source,
        'timestamp': None  # Will be set by JS
    }
    message_feed.append(message)
    if len(message_feed) > max_feed_size:
        message_feed.pop(0)
    socketio.emit('new_message', message)


@app.route('/')
def index():
    """Main UI page."""
    return render_template('index.html')


@app.route('/api/messages')
def get_messages():
    """Get all messages in the feed."""
    return jsonify(message_feed)


@app.route('/api/skills')
def list_skills():
    """List available skills."""
    # TODO: Load from plugins/skills
    return jsonify([
        {'name': 'proxmox', 'description': 'Manage Proxmox VMs and containers'},
        {'name': 'status', 'description': 'Check service status'},
        {'name': 'password', 'description': 'Look up passwords from 1Password'},
    ])


@app.route('/api/skills/<skill_name>/run', methods=['POST'])
def run_skill(skill_name):
    """Run a skill."""
    # TODO: Implement skill execution
    return jsonify({'status': 'ok', 'skill': skill_name})


@socketio.on('connect')
def handle_connect():
    """Handle client connection."""
    emit('connected', {'status': 'ok'})


if __name__ == '__main__':
    port = int(os.environ.get('HELPEX_UI_PORT', 8000))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)