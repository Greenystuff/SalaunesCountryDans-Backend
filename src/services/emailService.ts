import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

// Configurer le transporteur d'e-mail (exactement comme SafeTale)
const transporter = nodemailer.createTransport({
    service: 'smtp',
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        ciphers: 'SSLv3',
    },
});

interface HtmlVariables {
    nom_utilisateur?: string;
    lien_validation?: string;
    date_expiration?: string;
    email_utilisateur?: string;
    adresse_ip?: string;
}

export interface PasswordValidationData {
    userName: string;
    userEmail: string;
    validationToken: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: string;
}

// Fonction utilitaire pour lire le template HTML et injecter les variables (exactement comme SafeTale)
function renderTemplate(templatePath: fs.PathOrFileDescriptor, variables: HtmlVariables): string {
    let template = fs.readFileSync(templatePath, 'utf8');

    // Remplace chaque variable dans le template
    Object.keys(variables).forEach((key) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        template = template.replace(regex, variables[key as keyof HtmlVariables] || '');
    });

    return template;
}

// Fonction d'envoi d'email de validation de changement de mot de passe (comme SafeTale)
async function sendPasswordChangeValidation(data: PasswordValidationData): Promise<void> {
    const templatePath = path.resolve(__dirname, '../templates', 'passwordChangeValidation.html');
    const validationUrl = `${
        process.env.BACKEND_URL || 'http://localhost:3000'
    }/admin/validate-password-change?token=${data.validationToken}`;

    const variables: HtmlVariables = {
        nom_utilisateur: data.userName,
        lien_validation: validationUrl,
        date_expiration: data.expiresAt,
        email_utilisateur: data.userEmail,
        adresse_ip: data.ipAddress || 'Non disponible',
    };

    // Rendu du template avec les variables injectées
    const htmlContent = renderTemplate(templatePath, variables);

    // Options de l'e-mail
    let mailOptions: nodemailer.SendMailOptions = {
        from: `"Salaunes Country Dance" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        // to: data.userEmail,
        to: 'david_meunier@hotmail.fr',
        subject: 'Validation de changement de mot de passe - Salaunes Country Dance',
        html: htmlContent,
    };

    // Envoi de l'e-mail
    try {
        await transporter.sendMail(mailOptions);
        console.log(
            '✅ Email de validation de changement de mot de passe envoyé à:',
            data.userEmail
        );
    } catch (error: unknown) {
        if (error instanceof Error) {
            throw new Error(`Impossible d'envoyer l'e-mail de validation : ${error.message}`);
        } else {
            throw new Error("Impossible d'envoyer l'e-mail de validation : Erreur inconnue");
        }
    }
}

// Fonction utilitaire pour vérifier si le service est configuré
function isServiceConfigured(): boolean {
    return !!(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
    );
}

export { sendPasswordChangeValidation, isServiceConfigured };
