/*******************************************************
 * notifyTrips.ts
 *
 * Job diferido del sistema cooperativo.
 * Busca viajes realizados hace 7 días que todavía no
 * recibieron notificación y manda una push notification
 * al camionero preguntando si tuvo algún inconveniente.
 *
 * Se ejecuta cada 6 horas desde index.ts.
 *******************************************************/

import pool from "../db";

// manda una notificación push via la API de Expo
async function sendExpoPushNotification(
  pushToken: string,
  tripId: number,
  fechaViaje: string
): Promise<void> {
  const mensaje = {
    to: pushToken,
    sound: "default",
    title: "¿Tuviste algún inconveniente?",
    body: `Hace 7 días hiciste un viaje (${fechaViaje}). ¿Te pusieron alguna multa? Ayudá a la comunidad SafeTruck reportándolo.`,
    data: { tripId }, // el frontend puede usar esto para abrir la pantalla de reporte
  };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(mensaje),
  });

  if (!response.ok) {
    throw new Error(`Error enviando notificación: ${response.statusText}`);
  }
}

// función principal del job
export async function notifyPendingTrips(): Promise<void> {
  try {
    // busco viajes de hace ~7 días sin notificación cuyo usuario tiene push token
    const resViajes = await pool.query(`
      SELECT 
        t.id AS trip_id,
        t.user_id,
        t.started_at,
        u.push_token
      FROM trips t
      JOIN users u ON u.id = t.user_id
      WHERE t.notification_sent_at IS NULL
        AND t.started_at < NOW() - INTERVAL '7 days'
        AND t.started_at > NOW() - INTERVAL '8 days'
        AND u.push_token IS NOT NULL
    `);

    if (resViajes.rows.length === 0) {
      console.log('[notifyTrips] No hay viajes pendientes de notificar.');
      return;
    }

    console.log(`[notifyTrips] Notificando ${resViajes.rows.length} viajes...`);

    for (const viaje of resViajes.rows) {
      try {
        const fecha = new Date(viaje.started_at).toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        await sendExpoPushNotification(viaje.push_token, viaje.trip_id, fecha);

        // marco el viaje como notificado
        await pool.query(
          "UPDATE trips SET notification_sent_at = NOW() WHERE id = $1",
          [viaje.trip_id]
        );

        console.log(`[notifyTrips] Notificación enviada para trip ${viaje.trip_id}`);
      } catch (err) {
        // si falla una notificación, sigo con las demás
        console.error(`[notifyTrips] Error en trip ${viaje.trip_id}:`, err);
      }
    }
  } catch (err) {
    console.error('[notifyTrips] Error general en el job:', err);
  }
}