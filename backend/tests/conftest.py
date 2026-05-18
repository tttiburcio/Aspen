import sys
from pathlib import Path

# Garante que o backend/ esteja no path para imports funcionarem
sys.path.insert(0, str(Path(__file__).parent.parent))
