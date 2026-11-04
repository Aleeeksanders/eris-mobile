// ============================================================
// Eris Mobile — los textos de los botones ⓘ, en un solo lugar (2026-10-22)
//
// Pedido del usuario: «botones de información donde sea pertinente… a los que no les interesa, que no los abrume; cuando
// quieran buscar la información, que esté disponible para que no queden dudas». Cada texto:
//   - `corto`: lo que se ve al abrir (2–3 líneas, en palabras simples);
//   - `calculo`, `fuente`, `hacer`: «Ver más» (cómo se calcula, de dónde sale el dato, qué puedes hacer).
// Sin culpa ni alarma («medir sin obsesión»). Si un número cambia de regla, se cambia ACÁ.
// ============================================================

export interface InfoText {
  titulo: string;
  corto: string;
  calculo?: string;
  fuente?: string;
  hacer?: string;
}

export const INFO: Record<string, InfoText> = {
  // ─── Métricas: metas del día ───
  calorias: {
    titulo: 'Calorías',
    corto: 'La energía de lo que comes, contra lo que tu cuerpo gasta hoy. La marca blanca es lo esperable a esta hora de tu día.',
    calculo: 'Tu gasto del día: metabolismo basal (fórmula de Mifflin-St Jeor, con tu peso, altura, edad y sexo de Forge) × tu nivel de actividad, más tu entreno. Tu objetivo de Forge lo ajusta de forma moderada (perder: hasta −500 kcal; ganar: hasta +350), nunca bajo tu basal. Si fijaste una meta a mano, manda esa.',
    fuente: 'Lo que anotas en Nutrición y por chat; tu cuerpo y objetivo en Forge; tu actividad del reloj (Health Connect).',
    hacer: 'Es la misma meta en Inicio, Nutrición, Forge y el chat. Para cambiarla, ajusta tu objetivo en Forge.',
  },
  proteina: {
    titulo: 'Proteína',
    corto: 'Una meta a alcanzar (un mínimo, no un límite): ayuda a cuidar y construir músculo y a sentirte satisfecho.',
    calculo: 'Gramos por kilo según tu objetivo de Forge: 1,6 para mantener, 1,8 para ganar músculo, 2,0 en recomposición y 2,2 para perder grasa; sin objetivo, 1,6 si entrenas y 1,2 si no. Con enfermedad renal es un tope de 0,8 g/kg.',
    fuente: 'Morton y cols. 2018, la posición de la ISSN 2017 y Helms y cols. 2014; lo que anotas en Nutrición.',
    hacer: 'Huevos, legumbres, lácteos, pescado, pollo o carne en cada comida lo hacen fácil.',
  },
  carbos: {
    titulo: 'Carbohidratos',
    corto: 'La principal fuente de energía. Se compara con una referencia: el 45 % de tu meta de calorías, el mismo reparto que usa el asesor de comida.',
    calculo: 'Referencia = 45 % de tu meta de calorías ÷ 4 kcal por gramo. Debajo se ve qué % de la energía de hoy vino de los carbohidratos (la misma torta de Inicio). Con diabetes importa más el tipo y cómo se reparten en el día que el total, y tu meta la define tu equipo de salud.',
    fuente: 'La tabla nutricional de cada alimento.',
    hacer: 'Prefiere los que traen fibra (legumbres, avena, pan integral, fruta entera) y acompáñalos con proteína.',
  },
  grasa_saturada: {
    titulo: 'Grasa saturada',
    corto: 'La grasa de las carnes grasas, los embutidos, la mantequilla, el queso y las frituras. Es un límite: mientras más bajo, mejor para el corazón.',
    calculo: 'Suma la grasa saturada de lo anotado hoy (si un alimento no la trae, se estima con la base de Eris por su nombre). El límite es menos del 10 % de tu meta de calorías (OMS): con 2.000 kcal, 22 g.',
    fuente: 'La tabla nutricional de cada alimento.',
    hacer: 'Las carnes magras, el pescado, las legumbres y el aceite de oliva en vez de mantequilla la bajan.',
  },
  // ─── Métricas: límites del día ───
  sodio: {
    titulo: 'Sodio',
    corto: 'La sal de lo que comes. Es un límite, no una meta: mientras menos te pases, mejor para la presión y el corazón.',
    calculo: 'Suma el sodio de cada alimento anotado hoy. El límite es 2.000 mg al día (OMS); con presión alta o enfermedad renal, 1.500 mg.',
    fuente: 'La tabla nutricional de cada alimento (base chilena, USDA u Open Food Facts).',
    hacer: 'Si te pasaste, el resto del día prefiere comida casera sin sal agregada, fruta y verduras. Los embutidos, el pan y las sopas de sobre suman mucho sodio.',
  },
  azucar: {
    titulo: 'Azúcar',
    corto: 'El azúcar de lo que comes y bebes. Es un límite: pasarse un día no es grave, lo que importa es lo de siempre.',
    calculo: 'Suma los azúcares de cada alimento anotado hoy. El límite es 50 g al día (OMS: ~10 % de una dieta de 2.000 kcal); con diabetes o prediabetes, 25 g.',
    fuente: 'La tabla nutricional de cada alimento.',
    hacer: 'Cambiar bebidas y jugos por agua o versiones sin azúcar es lo que más baja este número.',
  },
  grasas: {
    titulo: 'Grasas',
    corto: 'Las grasas del día. Son necesarias; el límite evita que desplacen a la proteína y a las verduras.',
    calculo: 'Suma las grasas de cada alimento anotado hoy. El límite es tu meta de grasas si la pusiste en Perfil → Metas nutricionales; si no, 70 g al día (valor diario de la FDA, ~30 % de una dieta de 2.000 kcal).',
    fuente: 'La tabla nutricional de cada alimento.',
    hacer: 'Las frituras y los embutidos suman rápido; la palta, los frutos secos y el aceite de oliva son buenas grasas en porciones chicas.',
  },
  fibra: {
    titulo: 'Fibra',
    corto: 'La fibra es una meta a alcanzar: ayuda a la saciedad, al intestino y a que la glucosa suba más lento.',
    calculo: 'Suma la fibra de lo anotado hoy. La meta es 28 g al día (OMS). La marca blanca es lo esperable a esta hora de tu día.',
    fuente: 'La tabla nutricional de cada alimento.',
    hacer: 'Legumbres, avena, frutas con cáscara, verduras y frutos secos.',
  },
  agua: {
    titulo: 'Agua',
    corto: 'Se mide a esta hora de tu día: la marca blanca es lo que deberías llevar ahora, no la meta completa.',
    calculo: 'Meta: 35 ml por kilo + tu actividad y entreno (+30 % con algunos remedios). Cuenta lo que bebes y el agua que trae la comida. Lo esperable va desde que despiertas hasta ~2 h antes de dormir.',
    fuente: 'Lo que anotas (app, chat, botones de aviso) y Health Connect.',
    hacer: 'Si vas atrás, Eris te dice cuántos vasos te faltan para ir al día. Lo que falta para la meta se reparte hasta la noche.',
  },
  // ─── Nutrición: detalle de lo anotado ───
  calidad_alimento: {
    titulo: 'Calidad de este alimento',
    corto: 'Una letra de A (mejor) a E, más cuánto procesamiento tiene. Es un dato para elegir, no un juicio: un día se arma con muchas cosas.',
    calculo: 'Letra: estilo Nutri-Score (energía, azúcar, grasa saturada y sodio restan; fibra, proteína, frutas y verduras suman). Procesamiento NOVA: 1 natural, 2 ingrediente culinario, 3 procesado, 4 ultraprocesado. Los sellos «ALTO EN» siguen la Ley 20.606 y no van en lo natural (una manzana tiene su azúcar propia).',
    fuente: 'La tabla de cada alimento (Open Food Facts trae su propio Nutri-Score); si falta el sodio o la grasa saturada, se estima con la base de Eris por el nombre.',
    hacer: 'Es la misma nota que suma a la calidad de tu día en Métricas.',
  },
  vitaminas_dia: {
    titulo: 'Vitaminas y minerales de hoy',
    corto: 'Lo que llevas hoy de cada uno, sumando la comida y tus suplementos, contra lo recomendado al día para tu edad y sexo. No hace falta llegar al 100 % todos los días: importa la semana.',
    calculo: 'Cada alimento con su dato por porción (USDA en la base de Eris; Open Food Facts si el envase lo declara) + lo de los suplementos que marcaste «Tomado». La recomendación es la del NIH (RDA o ingesta adecuada). Si parte de lo que comiste no trae el dato, se avisa: puede ser más.',
    fuente: 'USDA FoodData Central, Open Food Facts y NIH Office of Dietary Supplements.',
    hacer: 'Lo que más suele faltar se sube con frutas, verduras, legumbres, frutos secos, lácteos y pescado. La vitamina D sale sobre todo del sol.',
  },
  calidad_dia: {
    titulo: 'Calidad de la alimentación',
    corto: 'Una nota de lo que comiste hoy hasta ahora: qué comiste, si va alcanzando para lo que toca a esta hora, tus vitaminas y minerales, y los horarios.',
    calculo: 'Qué comiste (55 %: Nutri-Score, procesamiento NOVA y sellos de cada comida), si alcanza (20 %: proteína, fibra y energía contra lo esperable a esta hora), vitaminas y minerales (10 %: los diez que más suelen faltar, con tus suplementos) y horarios (15 %). Si muy poco de lo comido trae vitaminas y minerales, esa parte no cuenta y el resto pesa 60, 25 y 15 %.',
    fuente: 'Lo que anotas en Nutrición y por chat; tus suplementos.',
    hacer: 'Es la misma nota que da el chat en «¿y si me como…?». Pesa 30 % del puntaje dinámico.',
  },
  modo_estricto: {
    titulo: 'Modo estricto con los antojos',
    corto: 'Apagado, un antojo que no calza con tu día viene con su impacto y una contrapartida que puedes aceptar o no. Encendido, Eris te lo recomienda solo si aceptas la contrapartida; si no, te propone otra cosa.',
    calculo: 'No calza si con lo típico del resto del día te pasarías más de 100 kcal de tu meta, o si baja harto la calidad de tu día. La contrapartida: la próxima comida principal más liviana (hasta 40 % menos de lo típico) y, si no alcanza, minutos de caminata a paso rápido según tu peso (hasta 60). Nunca se compensa al día siguiente.',
    hacer: 'Si aceptas el trato, cuando le pidas a Eris qué comer en esa comida ya te la propone más liviana, y lo recuerda en «¿cómo voy hoy?». Con insuficiencia cardíaca o EPOC no te indica caminar: la actividad la define tu médico.',
  },
  vista_simple: {
    titulo: 'Vista simple o completa',
    corto: 'La simple muestra tu día en pocas cosas y lo que conviene hacer ahora. La completa, todo el detalle. Se recuerda la que elijas.',
  },
  vitaminas: {
    titulo: 'Vitaminas y minerales',
    corto: 'Cuánto trae esta porción de cada vitamina y mineral, y qué parte es de lo recomendado al día para ti. No hace falta llegar al 100 % con un alimento: se suma en el día.',
    calculo: 'La recomendación diaria (RDA, o la ingesta adecuada donde no hay RDA) es la del NIH según tu edad y sexo de Forge; sin esos datos, la más alta de las dos. El embarazo no está considerado.',
    fuente: 'USDA FoodData Central para la base de Eris (los platos, por su receta) y lo que declara el envase en Open Food Facts. Lo anotado por chat usa el alimento de la base con ese nombre.',
    hacer: 'Las frutas, verduras, legumbres, lácteos y pescados suben casi todo.',
  },
  suplementos: {
    titulo: 'Suplementos',
    corto: 'Lo que tomas cada día, anotado en un toque. Suman a tus vitaminas y minerales, y si llevas su stock en el Botiquín, baja solo.',
    calculo: 'Cada «Tomado» cuenta una toma del día. La constancia es cuántas tomas hiciste de las que tenías en los últimos 7 días (desde que lo agregaste).',
    fuente: 'Lo que anotas tú. Las fichas: NIH Office of Dietary Supplements, International Society of Sports Nutrition, EFSA y ACSM.',
    hacer: 'Agrégalos en «+ Agregar», o desde su ficha. Eris no indica dosis: escribes la que te indicaron o la de la etiqueta.',
  },
  dosis_suplemento: {
    titulo: 'La dosis la escribes tú',
    corto: 'Escribe lo que tomas por vez, como te lo indicaron o como dice la etiqueta. Eris no sugiere dosis; si pasa el límite superior de los estudios, te avisa.',
    calculo: 'Con mg, µg o UI se calcula cuánto suma a tus vitaminas y minerales (1 µg de vitamina D = 40 UI). Con «1 cápsula» no se puede saber cuánto trae, así que no suma.',
    fuente: 'Límites superiores (UL) del NIH Office of Dietary Supplements.',
  },
  alergenos: {
    titulo: 'Alérgenos',
    corto: 'Los declarados en el envase, y los que puede tener por su nombre (un pan, gluten). Revisa siempre la etiqueta si tienes una alergia.',
    calculo: 'Declarados y trazas: los de Open Food Facts y la base de envasados de Eris. «Por el nombre»: palabras como pan, queso o camarón; prefiere avisar de más.',
    fuente: 'Open Food Facts (con los ingredientes leídos por Eris) y el nombre del alimento.',
  },
  tu_version: {
    titulo: 'Tu versión de un alimento',
    corto: 'Si los valores no calzan con lo que comes (la hallulla de tu panadería), corrígelos: desde ahí se usan los tuyos, en el buscador y en el chat.',
    calculo: 'Se guardan por 100 g (o 100 ml). Lo ya anotado con los valores de antes no cambia, salvo esta porción.',
    hacer: 'Para volver a los valores de la base, abre algo anotado con tu versión y toca «Dejar de usar mi versión».',
  },
  // ─── Inventario ───
  por_vencer: {
    titulo: 'Por vencer',
    corto: 'Lo que vence en los próximos 7 días, lo más urgente primero. En rojo, lo que ya venció.',
    calculo: 'Se compara la fecha de vencimiento que anotaste con la de hoy. Si compras más de lo mismo, queda la fecha más próxima.',
    fuente: 'La fecha que pones al agregar (o en Editar).',
    hacer: 'Úsalo primero. Si ya venció, «Lo boté»: así el inventario sigue fiel y ves cuánto se pierde.',
  },
  lista_compras: {
    titulo: 'Lista de compras',
    corto: 'Se arma sola: lo que se acabó o quedó bajo el mínimo que pusiste, más lo que anotes a mano.',
    calculo: 'Cuánto comprar: lo que compraste la última vez de eso. Costo estimado: lo que pagaste la última vez, por unidad. La ropa y los objetos no se «acaban»: no entran solos.',
    fuente: 'Tu inventario y el precio que pones al agregar.',
    hacer: '«✓ Lo compré» lo suma a tu casa y lo saca de la lista. «Compartir» la manda por WhatsApp a quien vaya a comprar.',
  },
  revision: {
    titulo: 'Revisión de la semana',
    corto: 'Para que el inventario siga fiel a la realidad: un toque por cada cosa que no cuentas hace una semana.',
    calculo: 'Entra lo que se consume (alimentos, despensa, baño, limpieza, botiquín) y tiene stock, si no lo contaste ni lo confirmaste en 7 días.',
    hacer: '«Está bien» si hay lo que dice; si no, «Cambiar» y pones cuánto hay. La diferencia queda en el historial de esa cosa.',
  },
  minimo: {
    titulo: 'Mínimo',
    corto: 'Cuando quede esto o menos, pasa sola a tu lista de compras (antes de que se acabe).',
    calculo: 'Se compara lo que hay con el mínimo, en la misma unidad de la cosa (unidades, kg, L…).',
    hacer: 'Ponlo en lo que no te puede faltar: papel higiénico, café, tus remedios.',
  },
  contenido: {
    titulo: 'Lo que trae cada uno',
    corto: 'Si cuentas por unidades o paquetes, cuánto trae cada uno: «1 L», «400 g». Así «usé 500 ml» descuenta media caja.',
    calculo: 'Con esto se convierten las cantidades: 2 L de una leche que viene en cajas de 1 L son 2 cajas.',
  },
  remedios: {
    titulo: 'Tus remedios',
    corto: 'Los remedios activos de tu perfil, con cuánto te queda y para cuántos días alcanza. Bajan solos cada día con las tomas que anotes.',
    calculo: 'Días que alcanza = lo que hay ÷ (unidades por toma × tomas al día). Las tomas al día se leen de tu horario («mañana y noche» = 2) y las puedes cambiar. Cuando alcanza para una semana o menos, pasa a tu lista de compras.',
    fuente: 'Tu perfil (Perfil → Salud) y lo que anotas aquí. La dosis se muestra tal como la escribiste.',
    hacer: 'Si un día no lo tomaste, toca el remedio → «Contar» y pon lo que hay. Eris no sugiere ni cambia dosis: eso lo decide tu médico.',
  },
  historial_medico: {
    titulo: 'Historial médico',
    corto: 'Tu grupo sanguíneo, alergias, condiciones, últimos exámenes y tus consultas o eventos con su fecha, en un solo lugar.',
    calculo: 'Todo sale de tu perfil (cifrado en el PC de Eris): lo que pones en Perfil → Salud, los exámenes que le cuentas a Eris y lo que anotas aquí.',
    hacer: 'Anota cada control, vacuna o urgencia: así no se te olvida la fecha y Eris puede tenerlo en cuenta. No reemplaza tu ficha clínica.',
  },
  comida_despensa: {
    titulo: 'Lo que comes sale de la despensa',
    corto: 'Lo que anotas en Nutrición (a mano o por chat) se descuenta solo de Alimentos y Despensa, si lo tienes anotado.',
    calculo: 'Se busca la comida en tu inventario por el nombre. Con el peso se calcula cuánto es: 110 g de huevo = 2 huevos; 250 ml de una caja de 1 L = ¼. Lo cocido de algo seco (arroz, fideos, legumbres) se descuenta como ~40 % de su peso. Si no se puede saber, queda «por confirmar».',
    hacer: 'Si comiste fuera, «Lo comí fuera» lo devuelve. Si borras la comida en Nutrición, vuelve sola. En ⚙ lo puedes apagar.',
  },
  lista_vs_presupuesto: {
    titulo: 'Contra tu presupuesto',
    corto: 'Lo que costaría tu lista, por categoría de Finanzas, contra lo que te queda del tope de esa categoría este mes.',
    calculo: 'Alimentos y despensa → Comida; baño, limpieza y objetos → Hogar y aseo; botiquín → Salud. Solo aparecen las categorías con tope en Finanzas → Plan.',
    fuente: 'El costo estimado de la lista y tu presupuesto al día en Finanzas.',
    hacer: 'Si no alcanza, compra primero lo que se acabó y deja lo que solo queda poco.',
  },
  // ─── Finanzas ───
  tu_plata: {
    titulo: 'Tu plata',
    corto: 'Toda la plata que tienes: la de tus cuentas, tu efectivo (si lo agregaste) y tu ahorro. No hay plata fuera de ahí.',
    calculo: 'Saldo de tus cuentas de débito + efectivo + cuentas de ahorro. Cada saldo sale de lo anotado: el saldo inicial más lo que entró, menos lo que salió. La tarjeta de crédito no suma (es deuda) y lo que te deben tampoco, hasta que te paguen.',
    fuente: 'Tus cuentas en Finanzas y lo que anotas (a mano, por chat, boletas, avisos del banco y cartolas).',
    hacer: 'Si un saldo no calza con tu banco, abre la cuenta → «Corregir saldo»: la diferencia queda anotada como ajuste.',
  },
  puedes_gastar: {
    titulo: 'Puedes gastar',
    corto: 'Lo que tienes en tus cuentas y efectivo, menos los fijos que se cobran antes de tu próximo ingreso.',
    calculo: 'Efectivo + débito − gastos fijos y cuotas que vienen antes del ingreso. Lo «por día» reparte eso entre los días que faltan. El ahorro no se cuenta: es para no tocarlo.',
    fuente: 'Tus cuentas, tus fijos (Plan) y la fecha de tu sueldo.',
    hacer: 'Si el ritmo no alcanza, baja el gasto del día a lo que dice «por día» o mueve un fijo.',
  },
  por_ordenar: {
    titulo: 'Por ordenar',
    corto: 'Cosas que se anotaron sin decir de qué cuenta salió la plata (o a cuál llegó). Como no están en ninguna cuenta, no cuentan en tu plata.',
    calculo: 'Un gasto o préstamo sin cuenta de origen, o un ingreso sin cuenta de destino. Los descuentos por planilla no van acá: nunca pasan por tus cuentas.',
    hacer: 'Tócalo y elige su cuenta (su saldo cambia). Si no era plata real, bórralo. Desde ahora todo se anota con su cuenta.',
  },
  tasa_ahorro: {
    titulo: 'Tasa de ahorro',
    corto: 'Qué parte de lo que te entra este mes te quedaría al cerrar el mes, si sigues gastando a tu ritmo.',
    calculo: 'Ingresos del mes (contando el sueldo que aún no llega) menos el gasto proyectado: lo gastado + tu gasto variable por día × los días que faltan + los fijos que vienen. Antes se comparaba con lo gastado hasta hoy y a mitad de mes daba casi 100 %.',
    fuente: 'Tus ingresos, gastos y fijos anotados en Finanzas.',
    hacer: 'Una regla simple: apartar el 10–20 % apenas llega el sueldo (+ → Ahorrar).',
  },
  rating: {
    titulo: 'Tu rating',
    corto: 'Una nota de AAA a CCC sobre cómo manejas la plata, no sobre cuánto ganas.',
    calculo: 'Cinco partes: tasa de ahorro al cierre del mes (30 %), colchón para emergencias: meses de gasto que cubre tu ahorro (25 %), deuda en tarjetas frente a tu ingreso (20 %), topes por categoría cumplidos (15 %) y si tu plata te alcanza hasta el próximo ingreso (10 %).',
    fuente: 'Tus cuentas, movimientos, fijos y topes en Finanzas.',
    hacer: 'Abajo de la nota está lo que más la sube. Con el mismo comportamiento, ganar menos no baja la nota.',
  },
  ult_habil: {
    titulo: 'Último día hábil',
    corto: 'El último día del mes que no es sábado, domingo ni feriado. Muchas empresas pagan el sueldo ese día.',
    calculo: 'Se calculan los feriados de Chile de cada año (fijos y móviles por ley) y el 31 de diciembre, que es feriado bancario.',
    hacer: 'Ese día te pregunto en Hoy si llegó tu sueldo. Los feriados de elecciones no se conocen antes: si cambia, confírmalo igual.',
  },
  planilla: {
    titulo: 'Descuento por planilla',
    corto: 'Un cobro que tu empleador descuenta antes de pagarte (crédito social, seguro, cuota sindical). Nunca pasa por tus cuentas.',
    calculo: 'Cuando confirmas que llegó el sueldo, se anota como gasto del mes en su categoría y, por el mismo monto, como «descontado por planilla» en tus ingresos: bruto − planilla = líquido.',
    hacer: 'Agrégalo en Plan → + Gasto fijo → «Viene descontado del sueldo».',
  },
};
