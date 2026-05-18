import os
import random
import re
import pandas as pd

# Configurações
INPUT_EXCEL = "Locadora.xlsx"
OUTPUT_DIR = "demo"
OUTPUT_EXCEL = os.path.join(OUTPUT_DIR, "Locadora_Demo.xlsx")

# Dicionários globais para manter integridade referencial
placa_map = {}
empresa_map = {}
cliente_map = {}
fornecedor_map = {}

# Geradores de strings fakes determinísticos/sequenciais
def get_fake_placa(original_placa):
    if not isinstance(original_placa, str) or len(original_placa.strip()) < 4:
        return original_placa
    
    original_placa = original_placa.strip().upper()
    if original_placa not in placa_map:
        # Cria placa no formato Mercosul FAKE: ABC1D23
        letras = "ABCDEFGHIJ"
        idx = len(placa_map) % 10
        fake = f"DEM{idx}{letras[idx]}{idx:02d}"
        placa_map[original_placa] = fake
    return placa_map[original_placa]

def get_fake_cnpj():
    base = random.randint(10000000, 99999999)
    return f"{base:08d}/0001-00"

def get_fake_empresa(nome):
    if not isinstance(nome, str): return nome
    n = nome.strip().upper()
    if n not in empresa_map:
        idx = len(empresa_map) + 1
        empresa_map[n] = f"Locadora Modelo S.A. Unidade {idx}"
    return empresa_map[n]

def get_fake_cliente(nome):
    if not isinstance(nome, str): return nome
    n = nome.strip().upper()
    if n not in cliente_map:
        idx = len(cliente_map) + 1
        cliente_map[n] = f"Cliente Estratégico {idx} LTDA"
    return cliente_map[n]

def get_fake_fornecedor(nome):
    if not isinstance(nome, str): return nome
    n = nome.strip().upper()
    if n not in fornecedor_map:
        idx = len(fornecedor_map) + 1
        fornecedor_map[n] = f"Fornecedor Serviços {idx} LTDA"
    return fornecedor_map[n]

def anonymize_sheet(sheet_name, df):
    # Remove non-ascii characters for printing safely on windows terminal
    printable_name = ''.join(c for c in sheet_name if ord(c) < 128)
    print(f"Processando aba: {printable_name or 'Aba'} ...")
    
    # 1. Mapeia colunas de Placa (mantendo integridade)
    for col in df.columns:
        if 'placa' in col.lower():
            df[col] = df[col].apply(get_fake_placa)
            
    # 2. Anonimiza Dados de Empresas e Clientes
    for col in df.columns:
        lcol = col.lower()
        if lcol in ['razaosocial', 'nomecliente']:
            if 'empresa' in sheet_name.lower():
                df[col] = df[col].apply(get_fake_empresa)
            else:
                df[col] = df[col].apply(get_fake_cliente)
        
        elif lcol in ['cnpj_cpf', 'cnpj', 'cpf']:
            df[col] = df[col].apply(lambda x: get_fake_cnpj() if pd.notna(x) else x)
            
        elif 'email' in lcol:
            df[col] = df[col].apply(lambda x: "contato@demoempresa.com.br" if pd.notna(x) else x)
            
        elif 'telefone' in lcol:
            df[col] = df[col].apply(lambda x: "(11) 5555-0199" if pd.notna(x) else x)
            
        elif 'socio' in lcol or 'sócio' in lcol:
            df[col] = df[col].apply(lambda x: "Gestor Administrador" if pd.notna(x) else x)
            
        elif 'fornecedor' in lcol:
            df[col] = df[col].apply(get_fake_fornecedor)

        elif 'responsavel' in lcol or 'responsável' in lcol:
            df[col] = df[col].apply(lambda x: "Colaborador Técnico" if pd.notna(x) else x)
            
        elif 'documentorede' in lcol:
            df[col] = df[col].apply(lambda x: "https://link-exemplo-seguro.com/documento.pdf" if pd.notna(x) else x)

        elif 'numapolice' in lcol or 'apoliceseguro' in lcol:
            df[col] = df[col].apply(lambda x: f"POL-{random.randint(10000, 99999)}" if pd.notna(x) else x)
            
        elif 'renavam' in lcol:
            df[col] = df[col].apply(lambda x: f"{random.randint(100000000, 999999999)}" if pd.notna(x) else x)
            
    # Tratamentos específicos para campos de placas concatenadas
    if 'Itens' in df.columns and 'SEGUROS' in sheet_name.upper():
        def fix_itens_seguros(val):
            if not isinstance(val, str): return val
            placas = [p.strip() for p in val.split(';')]
            fake_placas = [get_fake_placa(p) for p in placas]
            return "; ".join(fake_placas)
        df['Itens'] = df['Itens'].apply(fix_itens_seguros)
        
    return df

def main():
    print("Iniciando geracao do dataset demonstrativo ficticio...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    xls_in = pd.ExcelFile(INPUT_EXCEL)
    
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        for sheet in xls_in.sheet_names:
            df = pd.read_excel(xls_in, sheet_name=sheet)
            df_anon = anonymize_sheet(sheet, df)
            df_anon.to_excel(writer, sheet_name=sheet, index=False)
            
    print(f"\nPronto! Planilha demonstrativa salva em: {OUTPUT_EXCEL}")
    print(f"Total de placas unicas embaralhadas: {len(placa_map)}")
    print(f"Total de empresas mapeadas: {len(empresa_map)}")
    print(f"Total de clientes mapeados: {len(cliente_map)}")
    print(f"Total de fornecedores mapeados: {len(fornecedor_map)}")

if __name__ == "__main__":
    main()
