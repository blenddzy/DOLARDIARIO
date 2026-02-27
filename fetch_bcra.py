import requests
import json
import urllib3
from datetime import datetime

# Apagamos las advertencias de seguridad
urllib3.disable_warnings()

URL_CATALOGO = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias"

# IDs de las variables que nos interesan
ID_RESERVAS_TOTALES = 1
ID_COMPRA_DIVISAS = 78
ID_ORGANISMOS_INTERNACIONALES = 79
ID_SECTOR_PUBLICO = 80
ID_EFECTIVO_MINIMO = 81
ID_OTRAS_OPERACIONES = 82

IDS_DESGLOSE = [ID_COMPRA_DIVISAS, ID_ORGANISMOS_INTERNACIONALES, ID_SECTOR_PUBLICO, ID_EFECTIVO_MINIMO, ID_OTRAS_OPERACIONES]

def generar_json_bcra():
    try:
        print("Consultando la API v4.0 del BCRA...")
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        
        response = requests.get(URL_CATALOGO, headers=headers, verify=False)
        response.raise_for_status()
        
        datos = response.json().get("results", [])

        # Variables principales
        reservas_totales = 0
        fecha_reservas = ""
        intervencion_diaria = 0
        fecha_intervencion = ""

        # Desglose de variación de reservas
        desglose = []

        NOMBRES_DESGLOSE = {
            ID_COMPRA_DIVISAS: "Compra de divisas (MULC)",
            ID_ORGANISMOS_INTERNACIONALES: "Organismos internacionales",
            ID_SECTOR_PUBLICO: "Sector público",
            ID_EFECTIVO_MINIMO: "Efectivo mínimo",
            ID_OTRAS_OPERACIONES: "Otras operaciones",
        }

        for item in datos:
            id_var = item["idVariable"]

            if id_var == ID_RESERVAS_TOTALES:
                reservas_totales = item["ultValorInformado"]
                fecha_reservas = item["ultFechaInformada"]

            elif id_var == ID_COMPRA_DIVISAS:
                intervencion_diaria = item["ultValorInformado"]
                fecha_intervencion = item["ultFechaInformada"]

            # Capturar todos los IDs del desglose
            if id_var in IDS_DESGLOSE:
                desglose.append({
                    "id": id_var,
                    "nombre": NOMBRES_DESGLOSE.get(id_var, item.get("descripcion", "")),
                    "valor": item["ultValorInformado"],
                    "fecha": item["ultFechaInformada"]
                })

        # Ordenar desglose por ID para consistencia
        desglose.sort(key=lambda x: x["id"])

        # Armamos el JSON final
        resultado = {
            "ultima_actualizacion_script": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "reservas": {
                "valor": reservas_totales,
                "fecha": fecha_reservas
            },
            "intervencion": {
                "valor": intervencion_diaria,
                "fecha": fecha_intervencion
            },
            "desglose_variacion": desglose
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