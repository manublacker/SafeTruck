/*******************************************************
 * notifications.ts
 *
 * Maneja los permisos y el registro del push token
 * de Expo Notifications.
 *
 * Flujo:
 *   1. Al abrir la app, pido permiso de notificaciones
 *   2. Obtengo el Expo push token del dispositivo
 *   3. Lo mando al backend para guardarlo en la DB
 *******************************************************/

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getToken } from './api';

const API_URL = 'https://safetruck-backend.icysky-af60cdde.canadacentral.azurecontainerapps.io';

// configuro cómo se muestran las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

// solicita permisos y registra el push token en el backend
export async function registerPushToken(): Promise<void> {
  // en Android hay que crear un canal de notificaciones
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SafeTruck',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  // pido permiso al usuario
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // si el usuario no dio permiso, no hago nada
  if (finalStatus !== 'granted') {
    console.log('Permiso de notificaciones denegado.');
    return;
  }

  // obtengo el token del dispositivo
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const pushToken = tokenData.data;

  // lo mando al backend para guardarlo
  const authToken = getToken();
  if (!authToken) return;

  try {
    await fetch(`${API_URL}/api/users/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });
  } catch (err) {
    console.error('No se pudo registrar el push token:', err);
  }
}