import yfinance as yf
import json
from datetime import datetime

# Dividimos los activos en dos grupos
MERCADOS = {
    "argentina": ["YPF", "GGAL", "PAM", "BMA"],
    "global": ["SPY", "QQQ", "AAPL", "MSFT"]
}

def obtener_datos_mercado():
    print("Consultando datos del mercado financiero...")
    resultado = {
        "ultima_actualizacion": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "activos": {
            "argentina": {},
            "global": {}
        }
    }

    try:
        for categoria, tickers in MERCADOS.items():
            print(f"\nProcesando mercado: {categoria.upper()}")
            for ticker in tickers:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="5d")
                
                if len(hist) >= 2:
                    ultimo_precio = hist['Close'].iloc[-1]
                    precio_anterior = hist['Close'].iloc[-2]
                    variacion_pct = ((ultimo_precio - precio_anterior) / precio_anterior) * 100

                    resultado["activos"][categoria][ticker] = {
                        "precio": round(ultimo_precio, 2),
                        "variacion_pct": round(variacion_pct, 2)
                    }
                    print(f"  {ticker}: U$D {round(ultimo_precio, 2)} ({round(variacion_pct, 2)}%)")

        with open('mercado_data.json', 'w') as f:
            json.dump(resultado, f, indent=4)
            
        print("\n¡Éxito! Datos guardados en mercado_data.json divididos por sector.")

    except Exception as e:
        print(f"Error al obtener los datos: {e}")

if __name__ == "__main__":
    obtener_datos_mercado()