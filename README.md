# 🎮 HexInvaders

Juego arcade educativo para aprender a convertir números hexadecimales a binario.

Los marcianos caen con su código hexadecimal. El jugador compone los dos nibbles
binarios con las teclas **QWER** (nibble izquierdo) y **UIOP** (nibble derecho), y
el cañón dispara automáticamente cuando la respuesta es correcta.

> Desarrollado por **José Manuel Lizana Jiménez** — Departamento de Informática, IES Ciudad Jardín.

---

## Modos de juego

| Modo | Descripción |
|------|-------------|
| **Libre** | Dificultad progresiva automática. Los marcianos aceleran y se multiplican con la puntuación. |
| **Nivel fijo** | Elige entre 6 niveles de dificultad (0 al 5). |
| **Sala multijugador** | Varios jugadores compiten en tiempo real. Ranking en vivo y podio final. |

## Controles

| Tecla | Acción |
|-------|--------|
| `Q W E R` | Bits del nibble izquierdo (8 4 2 1) |
| `U I O P` | Bits del nibble derecho (8 4 2 1) |
| `H` | Mostrar/ocultar tabla hex→bin |
| `Espacio` | Pausa / Reanudar |
| `ESC` | Volver al menú |

## Capturas

```
 ┌─────────────────────────────────────────────────────────────┐
 │  PUNTOS: 120          NIVEL 2                      ♥ ♥ ♥   │
 │                                                             │
 │              👾 B4                  👾 2F                   │
 │                                                             │
 │                       🚀                                   │
 │  ┌────┬────┬────┬────┐        ┌────┬────┬────┬────┐        │
 │  │ 1  │ 0  │ 1  │ 1  │        │ 0  │ 1  │ 0  │ 0  │        │
 │  └────┴────┴────┴────┘        └────┴────┴────┴────┘        │
 └─────────────────────────────────────────────────────────────┘
```

---

## Tecnologías

- **Backend:** Python 3.12 · Flask 3.1 · Flask-SocketIO · Gunicorn · eventlet
- **Frontend:** JavaScript ES6+ · HTML5 Canvas · Web Audio API · Socket.IO
- **Infraestructura:** Docker · Docker Compose

---

## Despliegue con Docker

**Requisitos:** Docker ≥ 24 y Docker Compose v2.

```bash
git clone https://github.com/joseliza/hexagame.git
cd hexagame
docker compose up --build -d
```

Abre el juego en **http://localhost:5000**.

Para actualizar:

```bash
git pull
docker compose down && docker compose up --build -d
```

## Despliegue manual

**Requisitos:** Python ≥ 3.10.

```bash
git clone https://github.com/joseliza/hexagame.git
cd hexagame
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Abre el juego en **http://localhost:5000**.

---

## Documentación técnica

Disponible en **`/docs`** una vez desplegado el juego, o en el propio menú del juego (opción *Acerca de*).

---

## Licencia

[Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/deed.es)

Libre uso, modificación y redistribución con atribución y misma licencia.
