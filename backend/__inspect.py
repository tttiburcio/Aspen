import sys, sqlite3
sys.path.insert(0, '.')
from database import DB_PATH
con = sqlite3.connect(str(DB_PATH))
for tbl in ['contratos','clientes','contrato_veiculo','faturamento']:
    try:
        cols = [c[1] for c in con.execute('PRAGMA table_info(%s)' % tbl).fetchall()]
        cnt = con.execute('SELECT COUNT(*) FROM %s' % tbl).fetchone()[0]
        print('%s: %d rows, cols=%s' % (tbl, cnt, cols))
        if cnt > 0:
            for r in con.execute('SELECT * FROM %s LIMIT 2' % tbl).fetchall():
                print('  ', r)
    except Exception as e:
        print('%s: ERRO %s' % (tbl, e))
con.close()
