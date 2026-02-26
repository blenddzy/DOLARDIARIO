import requests
import json
import urllib3
from datetime import datetime

# Apagamos las advertencias de seguridad
urllib3.disable_warnings()

URL_CATALOGO = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias"

def generar_json_bcra():
    try:
        print("Consultando la API v4.0 del BCRA...")
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        
        response = requests.get(URL_CATALOGO, headers=headers, verify=False)
        response.raise_for_status()
        
        datos = response.json().get("results", [])

        # Variables para guardar nuestros datos
        reservas_totales = 0
        fecha_reservas = ""
        intervencion_diaria = 0
        fecha_intervencion = ""

        # Buscamos exactamente los IDs 1 y 78
        for item in datos:
            if item["idVariable"] == 1:
                reservas_totales = item["ultValorInformado"]
                fecha_reservas = item["ultFechaInformada"]
            elif item["idVariable"] == 78:
                intervencion_diaria = item["ultValorInformado"]
                fecha_intervencion = item["ultFechaInformada"]

        # Armamos el JSON final limpio para la web
        resultado = {
            "ultima_actualizacion_script": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "reservas": {
                "valor": reservas_totales,
                "fecha": fecha_reservas
            },
            "intervencion": {
                "valor": intervencion_diaria,
                "fecha": fecha_intervencion
            }
        }

        # Guardamos el archivo
        with open('bcra_data.json', 'w') as f:
            json.dump(resultado, f, indent=4)

        print("¡Éxito! Archivo bcra_data.json generado con estos datos:")
        print(json.dumps(resultado, indent=4))

    except Exception as e:
        print(f"Error crítico al obtener los datos: {e}")

if __name__ == "__main__":
    generar_json_bcra()