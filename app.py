import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import random
import string
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or os.urandom(32)
socketio = SocketIO(app, cors_allowed_origins='https://hexagame.iesciudadjardin.es', async_mode='eventlet')

rooms = {}  # code -> {players, state, creator}

MAX_ROOMS        = 50   # salas simultáneas máximas
MAX_PLAYERS_ROOM = 30   # jugadores máximos por sala
_RATE_WINDOW     = 60   # segundos de ventana para rate limiting
_RATE_MAX        = 5    # máximo de salas nuevas por IP en esa ventana
_JOIN_MAX        = 15   # máximo de intentos de unirse por IP en esa ventana
_SCORE_INTERVAL  = 1.0  # segundos mínimos entre score_update por jugador
_room_creation   = {}   # ip -> [timestamps] para create_room
_room_joins      = {}   # ip -> [timestamps] para join_room_req


def _real_ip():
    """Devuelve la IP real del cliente.
    Toma la última entrada de X-Forwarded-For (añadida por el proxy, no falsificable)
    y cae a REMOTE_ADDR si no hay proxy.
    """
    xff = request.environ.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[-1].strip()
    return request.environ.get('REMOTE_ADDR', '')


def _check_rate(ip, store, max_count):
    """Devuelve True si la IP no supera max_count eventos en _RATE_WINDOW segundos.
    Actualiza store y poda entradas expiradas.
    """
    now = time.time()
    recent = [t for t in store.get(ip, []) if now - t < _RATE_WINDOW]
    if len(recent) >= max_count:
        store[ip] = recent
        return False
    recent.append(now)
    store[ip] = recent
    for old_ip in [k for k, v in store.items() if not v]:
        del store[old_ip]
    return True


def _gen_code():
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=4))
        if code not in rooms:
            return code


def _player_list(room):
    return sorted(
        [{'nick': n, 'score': p.get('score', 0),
          'lives': p.get('lives', 3), 'state': p.get('state', 'lobby')}
         for n, p in room['players'].items()],
        key=lambda x: x['score'], reverse=True
    )


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/docs')
def docs():
    return render_template('docs.html')


@socketio.on('create_room')
def on_create_room(data):
    if len(rooms) >= MAX_ROOMS:
        emit('room_error', {'msg': 'Servidor lleno. Inténtalo más tarde.'})
        return
    if not _check_rate(_real_ip(), _room_creation, _RATE_MAX):
        emit('room_error', {'msg': 'Demasiadas salas creadas. Espera un momento.'})
        return
    nick = (data.get('nick') or 'Anónimo')[:12].strip()
    code = _gen_code()
    rooms[code] = {
        'players': {nick: {'score': 0, 'lives': 3, 'state': 'lobby', 'sid': request.sid}},
        'state': 'lobby',
        'creator': nick,
    }
    join_room(code)
    emit('room_created', {'code': code, 'nick': nick, 'creator': nick,
                          'players': _player_list(rooms[code])})


@socketio.on('join_room_req')
def on_join_room(data):
    if not _check_rate(_real_ip(), _room_joins, _JOIN_MAX):
        emit('room_error', {'msg': 'Demasiados intentos. Espera un momento.'})
        return
    nick = (data.get('nick') or 'Anónimo')[:12].strip()
    code = (data.get('code') or '').upper().strip()
    if code not in rooms:
        emit('room_error', {'msg': 'Sala no encontrada. Comprueba el código.'})
        return
    room = rooms[code]
    if len(room['players']) >= MAX_PLAYERS_ROOM:
        emit('room_error', {'msg': 'La sala está llena.'})
        return
    base = nick
    suffix = 1
    while nick in room['players']:
        nick = f'{base}{suffix}'
        suffix += 1
    room['players'][nick] = {'score': 0, 'lives': 3, 'state': 'lobby', 'sid': request.sid}
    join_room(code)
    emit('room_joined', {'code': code, 'nick': nick, 'creator': room['creator'],
                         'players': _player_list(room)})
    emit('player_joined', {'nick': nick, 'players': _player_list(room)},
         to=code, include_self=False)


@socketio.on('start_game')
def on_start_game(data):
    code = data.get('code')
    if code not in rooms:
        return
    rooms[code]['state'] = 'playing'
    emit('game_starting', {}, to=code)


@socketio.on('score_update')
def on_score_update(data):
    code, nick = data.get('code'), data.get('nick')
    if code not in rooms or nick not in rooms[code]['players']:
        return
    p = rooms[code]['players'][nick]
    now = time.time()
    if now - p.get('last_update', 0) < _SCORE_INTERVAL:
        return
    p['last_update'] = now
    p['score'] = data.get('score', 0)
    p['lives'] = data.get('lives', 0)
    p['state'] = 'playing'
    emit('scores_update', {'players': _player_list(rooms[code])}, to=code)


@socketio.on('player_gameover')
def on_player_gameover(data):
    code, nick = data.get('code'), data.get('nick')
    if code not in rooms or nick not in rooms[code]['players']:
        return
    p = rooms[code]['players'][nick]
    new_score = data.get('score', 0)
    p['score'] = max(p.get('score', 0), new_score)
    p['lives'] = 0
    p['state'] = 'gameover'
    emit('scores_update', {'players': _player_list(rooms[code])}, to=code)


@socketio.on('show_podium')
def on_show_podium(data):
    code = data.get('code')
    if code not in rooms:
        return
    room = rooms[code]
    creator_sid = room['players'].get(room['creator'], {}).get('sid')
    if request.sid != creator_sid:
        return
    room['state'] = 'finished'
    sorted_p = _player_list(room)
    emit('podium_show', {'top': sorted_p[:3], 'all': sorted_p}, to=code)


@socketio.on('leave_room_req')
def on_leave_room(data):
    code, nick = data.get('code'), data.get('nick')
    if code not in rooms:
        return
    room = rooms[code]
    room['players'].pop(nick, None)
    leave_room(code)
    if not room['players']:
        del rooms[code]
    else:
        emit('player_left', {'nick': nick, 'players': _player_list(room)}, to=code)


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    for code in list(rooms.keys()):
        if code not in rooms:
            continue
        room = rooms[code]
        for nick, p in list(room['players'].items()):
            if p.get('sid') == sid:
                room['players'].pop(nick)
                if not room['players']:
                    del rooms[code]
                else:
                    emit('player_left', {'nick': nick, 'players': _player_list(room)}, to=code)
                return


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
