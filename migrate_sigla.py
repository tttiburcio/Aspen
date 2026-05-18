import sqlite3

def migrate():
    conn = sqlite3.connect('locadora.db')
    try:
        conn.execute('ALTER TABLE empresas ADD COLUMN sigla VARCHAR(20)')
        print("Column sigla added.")
    except Exception as e:
        print("Column sigla might already exist:", e)
        
    conn.execute("UPDATE empresas SET sigla = 'TKJ' WHERE id = 1")
    conn.execute("UPDATE empresas SET sigla = 'FINITA' WHERE id = 2")
    conn.execute("UPDATE empresas SET sigla = 'LANDKRAFT' WHERE id = 3")
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == '__main__':
    migrate()
