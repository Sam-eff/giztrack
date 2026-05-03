import logging
import re
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

def build_html_email(subject: str, plain_text_body: str) -> str:
    """
    Wraps a plain text email body in a professional HTML template with the Giztrack logo.
    """
    paragraphs = plain_text_body.strip().split('\n\n')
    
    html_paragraphs = []
    url_pattern = re.compile(r'(https?://[^\s]+)')

    for p in paragraphs:
        if url_pattern.fullmatch(p.strip()):
            url = p.strip()
            html_paragraphs.append(
                f'<div style="text-align: center; margin: 32px 0;">'
                f'<a href="{url}" style="background-color: #134e5e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Open Link</a>'
                f'</div>'
            )
            continue
            
        lines = p.split('\n')
        p_html_lines = []
        for line in lines:
            if url_pattern.fullmatch(line.strip()):
                url = line.strip()
                p_html_lines.append(
                    f'<div style="text-align: center; margin: 24px 0;">'
                    f'<a href="{url}" style="background-color: #134e5e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Open Link</a>'
                    f'</div>'
                )
            else:
                line_html = url_pattern.sub(r'<a href="\1" style="color: #134e5e; text-decoration: underline; font-weight: 500;">\1</a>', line)
                p_html_lines.append(line_html)
                
        p_html = "<br>".join(p_html_lines)
        p_html = p_html.replace('<br><div', '<div').replace('</div><br>', '</div>')
        
        html_paragraphs.append(f'<div style="margin-bottom: 16px; line-height: 1.6; color: #334155;">{p_html}</div>')
    
    body_content = "".join(html_paragraphs)
    
    # Base URL for the logo (fallback to giztrack.com if not set)
    logo_url = "https://giztrack.com/favicon.png"
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{subject}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
            body {{
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #f8fafc;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }}
            .container {{
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }}
            .header {{
                text-align: center;
                padding: 32px 32px 0 32px;
            }}
            .logo {{
                width: 48px;
                height: 48px;
                border-radius: 12px;
                margin-bottom: 16px;
            }}
            .content {{
                padding: 32px;
                color: #334155;
                font-size: 15px;
            }}
            .footer {{
                background-color: #f1f5f9;
                padding: 24px 32px;
                text-align: center;
                font-size: 13px;
                color: #64748b;
                border-top: 1px solid #e2e8f0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="{logo_url}" alt="Giztrack Logo" class="logo">
                <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 600;">{subject}</h2>
            </div>
            <div class="content">
                {body_content}
            </div>
            <div class="footer">
                <p style="margin: 0;">© 2026 Giztrack. All rights reserved.</p>
                <p style="margin: 8px 0 0 0;">This email was sent by Giztrack, the operating system for tech shops.</p>
            </div>
        </div>
    </body>
    </html>
    """

def send_giztrack_email(subject: str, message: str, recipient_list: list, fail_silently: bool = False):
    """
    Sends a professional email containing both HTML and plain-text versions.
    Replaces standard send_mail calls.
    """
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "Giztrack <noreply@giztrack.com>")
    
    html_message = build_html_email(subject, message)
    
    email = EmailMultiAlternatives(
        subject=subject,
        body=message,  # Plain text fallback
        from_email=from_email,
        to=recipient_list,
    )
    email.attach_alternative(html_message, "text/html")
    
    try:
        email.send(fail_silently=fail_silently)
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_list}: {e}")
        if not fail_silently:
            raise e
