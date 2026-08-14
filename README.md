# ¿De dónde salen estos datos?
▾
#### Fuente
API pública de Red Eléctrica de España (REE), sin clave ni registro. Se consulta el "widget" de precios de mercado horarios:

```
apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real
?start_date=AAAA-MM-DDT00:00&end_date=AAAA-MM-DDT23:59&time_trunc=hour
```
De la respuesta se usa la serie PVPC: el precio regulado horario, que sigue el mismo patrón de mercado que las tarifas indexadas como Octopus Flexi.

### Cálculos aplicados
Unidad: REE da el precio en €/MWh → se divide entre 1000 para pasarlo a €/kWh, la unidad de tu factura.

Bandas barato / medio / caro: se ordenan las 24 horas del día de menor a mayor precio y se cortan en tercios (terciles). El tercio más barato = BARATO, el de en medio = MEDIO, el más caro = CARO. Es relativo a cada día, no un umbral fijo en €.

Mejor y peor franja: se prueban todas las ventanas de 3 horas seguidas y se eligen la de media más baja y la de media más alta.

**Actualización**: la página se refresca sola cada 10 minutos.
### Precio de mañana
REE publica los precios del día siguiente sobre las 20:15h. Hasta esa hora la pestaña "Mañana" aparece desactivada; en cuanto la API responde con datos, se activa sola.

### Diferencia con tu factura Octopus Flexi
El PVPC y Octopus Flexi siguen el mismo patrón horario porque ambos están indexados al mercado mayorista (OMIE). Pero Octopus añade su propio margen de gestión y las fórmulas de peajes/impuestos no son idénticas a las del PVPC, así que el céntimo exacto puede variar un poco. Para el precio exacto de tu factura, consulta la app de Octopus.
