"""Plantillas HTML para correos transaccionales.

Usan `string.Template` (stdlib) para evitar una dependencia de plantillas.
Cada función recibe los datos y devuelve el HTML completo.
"""

from string import Template

from app.core.config import settings


def _wrap(title: str, body_html: str) -> str:
    return Template(
        """<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="padding:0 16px 12px;">
                <div style="font-size:20px;font-weight:700;color:#111827;">VetCore</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="padding:32px 32px 8px;">
                      <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">$title</h1>
                      $body
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px;">
                <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                  VetCore — Sistema de gestión veterinaria. Este correo es transaccional y fue enviado automáticamente.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    ).safe_substitute(title=title, body=body_html)


def _button(url: str, label: str) -> str:
    return (
        f'<p style="margin:24px 0 8px;"><a href="{url}" '
        f'style="display:inline-block;background-color:#4f46e5;color:#ffffff;'
        f'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">{label}</a></p>'
    )


def _text_block(paragraphs: list[str]) -> str:
    return "".join(
        f'<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">{p}</p>'
        for p in paragraphs
    )


def _small(text: str) -> str:
    return f'<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">{text}</p>'


def _link(url: str, label: str | None = None) -> str:
    label = label or url
    return f'<a href="{url}" style="color:#4f46e5;word-break:break-all;">{label}</a>'


def welcome_email(recipient_name: str) -> str:
    return _wrap(
        "¡Bienvenido a VetCore!",
        _text_block(
            [
                f"Hola, <strong>{recipient_name}</strong>:",
                "Tu cuenta fue creada correctamente. Ya puedes iniciar sesión en la plataforma y "
                "comenzar a trabajar en tu clínica.",
            ]
        )
        + _button(f"{settings.app_base_url}/login", "Iniciar sesión"),
    )


def staff_invitation_email(recipient_name: str, invite_url: str, clinic_name: str) -> str:
    return _wrap(
        "Te invitaron a VetCore",
        _text_block(
            [
                f"Hola, <strong>{recipient_name}</strong>:",
                f"El administrador de <strong>{clinic_name}</strong> te invitó a unirte a VetCore.",
                "Para activar tu cuenta y definir tu contraseña, haz clic en el botón. El enlace "
                "es válido por 72 horas.",
            ]
        )
        + _button(invite_url, "Activar mi cuenta")
        + _small("Si no esperabas esta invitación, puedes ignorar este correo.")
        + _small(_link(invite_url)),
    )


def password_reset_email(reset_url: str) -> str:
    return _wrap(
        "Recupera tu contraseña",
        _text_block(
            [
                "Recibimos una solicitud para restablecer la contraseña de tu cuenta en VetCore.",
                "Para elegir una contraseña nueva, haz clic en el botón. El enlace es válido por 30 minutos.",
            ]
        )
        + _button(reset_url, "Restablecer contraseña")
        + _small("Si no solicitaste este cambio, ignora este correo; tu contraseña no cambiará.")
        + _small(_link(reset_url)),
    )


def login_alert_email(recipient_name: str, time_str: str, ip: str, location: str) -> str:
    return _wrap(
        "Nuevo inicio de sesión en tu cuenta",
        _text_block(
            [
                f"Hola, <strong>{recipient_name}</strong>:",
                "Detectamos un inicio de sesión en tu cuenta de VetCore:",
            ]
        )
        + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">'
        + "<tr><td style='font-size:14px;color:#374151;padding:4px 16px 4px 0;'><strong>Fecha</strong></td>"
        + f"<td style='font-size:14px;color:#374151;'>{time_str}</td></tr>"
        + "<tr><td style='font-size:14px;color:#374151;padding:4px 16px 4px 0;'><strong>IP</strong></td>"
        + f"<td style='font-size:14px;color:#374151;'>{ip}</td></tr>"
        + "<tr><td style='font-size:14px;color:#374151;padding:4px 16px 4px 0;'><strong>Ubicación</strong></td>"
        + f"<td style='font-size:14px;color:#374151;'>{location}</td></tr>"
        + "</table>"
        + _text_block(
            [
                "Si fuiste tú, no necesitas hacer nada. Si no reconoces este acceso, cambia tu "
                "contraseña de inmediato.",
            ]
        )
        + _button(f"{settings.app_base_url}/forgot-password", "Cambiar contraseña"),
    )


def appointment_reminder_email(
    pet_name: str, clinic_name: str, when_str: str, procedure: str
) -> str:
    return _wrap(
        "Recordatorio de cita",
        _text_block(
            [
                f"Te recordamos la cita de <strong>{pet_name}</strong> en <strong>{clinic_name}</strong>.",
            ]
        )
        + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">'
        + "<tr><td style='font-size:14px;color:#374151;padding:4px 16px 4px 0;'><strong>Servicio</strong></td>"
        + f"<td style='font-size:14px;color:#374151;'>{procedure}</td></tr>"
        + "<tr><td style='font-size:14px;color:#374151;padding:4px 16px 4px 0;'><strong>Fecha y hora</strong></td>"
        + f"<td style='font-size:14px;color:#374151;'>{when_str}</td></tr>"
        + "</table>"
        + _text_block(["Si necesitas reprogramar o cancelar, contacta a la clínica."]),
    )


def birthday_email(pet_name: str, clinic_name: str) -> str:
    return _wrap(
        "¡Feliz cumpleaños!",
        _text_block(
            [
                f"¡Hoy <strong>{pet_name}</strong> cumple años!",
                f"Desde <strong>{clinic_name}</strong> te mandamos un saludo especial y le deseamos "
                "un día lleno de mimos y golosinas.",
                "¿Ya tienes su próxima cita de control?",
            ]
        )
        + _button(f"{settings.app_base_url}/", "Agendar cita"),
    )
