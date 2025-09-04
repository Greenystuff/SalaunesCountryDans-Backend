import { Application } from 'express';
import { Server as HttpServer } from 'http';
import expressWs from 'express-ws';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import WebSocket from 'ws';

// Interface pour les données utilisateur dans le WebSocket
interface AuthenticatedWebSocket extends WebSocket {
    user?: {
        _id: string;
        email: string;
        role: string;
    };
    userId?: string;
    isAuthenticated?: boolean;
}

// Types pour les messages WebSocket
interface WebSocketMessage {
    type:
        | 'notification'
        | 'dataUpdate'
        | 'profileUpdate'
        | 'userActivity'
        | 'authenticated'
        | 'pong';
    data: any;
    timestamp: string;
}

interface NotificationMessage {
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    title?: string;
}

interface DataUpdateMessage {
    entity: string;
    action: 'create' | 'update' | 'delete';
    data: any;
}

interface UserActivityMessage {
    userId: string;
    action: string;
    details?: any;
}

class WebSocketService {
    private wsInstance: expressWs.Instance | null = null;
    private authenticatedUsers: Map<string, AuthenticatedWebSocket[]> = new Map();
    private app: Application | null = null;

    /**
     * Initialiser le serveur WebSocket avec express-ws
     */
    public initialize(app: Application, server?: HttpServer): void {
        this.app = app;

        // Utiliser le serveur HTTP si fourni, sinon laisser express-ws le créer
        if (server) {
            this.wsInstance = expressWs(app, server);
        } else {
            this.wsInstance = expressWs(app);
        }

        // Route WebSocket avec authentification
        this.wsInstance.app.ws('/ws', (ws: AuthenticatedWebSocket, req) => {
            console.log(
                '🔌 Nouvelle connexion WebSocket depuis:',
                req.ip || req.connection.remoteAddress
            );

            // Gérer l'authentification
            this.handleAuthentication(ws, req)
                .then(() => {
                    console.log('✅ Authentification WebSocket réussie');
                    this.handleConnection(ws);
                })
                .catch((error) => {
                    console.error('❌ Authentification WebSocket échouée:', error.message);
                    console.error('   Détails:', error);
                    ws.close(1008, 'Authentication failed');
                });
        });
    }

    /**
     * Gérer l'authentification WebSocket
     */
    private async handleAuthentication(ws: AuthenticatedWebSocket, req: any): Promise<void> {
        // Récupérer le token depuis les paramètres de requête ou les headers
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            throw new Error('Token manquant');
        }

        // Vérifier le token JWT
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            throw new Error('Configuration JWT manquante');
        }

        const decoded = jwt.verify(token, jwtSecret) as any;

        // Récupérer l'utilisateur
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            throw new Error('Utilisateur non trouvé ou inactif');
        }

        // Attacher les infos utilisateur au WebSocket
        ws.user = {
            _id: user._id.toString(),
            email: user.email,
            role: user.role,
        };
        ws.userId = user._id.toString();
        ws.isAuthenticated = true;
    }

    /**
     * Gérer une nouvelle connexion
     */
    private handleConnection(ws: AuthenticatedWebSocket): void {
        if (!ws.user || !ws.isAuthenticated) {
            ws.close();
            return;
        }

        const userId = ws.user._id;
        console.log(`✅ WebSocket: Utilisateur ${ws.user.email} connecté`);

        // Ajouter le WebSocket à la liste des utilisateurs connectés
        if (!this.authenticatedUsers.has(userId)) {
            this.authenticatedUsers.set(userId, []);
        }
        this.authenticatedUsers.get(userId)!.push(ws);

        // Envoyer un message de bienvenue
        this.sendMessage(ws, 'authenticated', {
            message: 'Connexion WebSocket établie',
            user: ws.user,
        });

        // Envoyer les notifications en attente
        this.sendPendingNotifications(userId);

        // Gestion des messages reçus
        ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('❌ Erreur parsing message WebSocket:', error);
            }
        });

        // Gestion de la déconnexion
        ws.on('close', () => {
            console.log(`❌ WebSocket: Utilisateur ${ws.user!.email} déconnecté`);

            // Retirer le WebSocket de la liste
            const userSockets = this.authenticatedUsers.get(userId);
            if (userSockets) {
                const index = userSockets.indexOf(ws);
                if (index > -1) {
                    userSockets.splice(index, 1);
                }

                // Si plus de WebSockets pour cet utilisateur, supprimer l'entrée
                if (userSockets.length === 0) {
                    this.authenticatedUsers.delete(userId);
                }
            }

            // Informer les admins de la déconnexion
            this.broadcastToAdmins('userActivity', {
                userId: ws.user!._id,
                action: 'disconnected',
            });
        });

        // Gestion des erreurs
        ws.on('error', (error) => {
            console.error('❌ Erreur WebSocket:', error);
        });
    }

    /**
     * Envoyer un message WebSocket
     */
    private sendMessage(ws: AuthenticatedWebSocket, type: string, data: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            const message: WebSocketMessage = {
                type: type as any,
                data,
                timestamp: new Date().toISOString(),
            };
            ws.send(JSON.stringify(message));
        }
    }

    /**
     * Gérer les messages reçus
     */
    private handleMessage(ws: AuthenticatedWebSocket, message: any): void {
        switch (message.type) {
            case 'ping':
                this.sendMessage(ws, 'pong', {
                    message: 'Pong! Connexion active',
                });
                break;

            case 'userActive':
                this.broadcastToAdmins('userActivity', {
                    userId: ws.user!._id,
                    action: 'active',
                });
                break;

            case 'requestData':
                this.sendMessage(ws, 'notification', {
                    type: 'info',
                    message: `Données ${message.entity} demandées`,
                });
                break;

            default:
                console.log('🔍 Message WebSocket non géré:', message);
        }
    }

    /**
     * Broadcast aux admins
     */
    private broadcastToAdmins(type: string, data: any): void {
        this.authenticatedUsers.forEach((userSockets, userId) => {
            userSockets.forEach((ws) => {
                if (ws.user?.role === 'admin') {
                    this.sendMessage(ws, type, data);
                }
            });
        });
    }

    /**
     * Broadcast à tous les utilisateurs
     */
    private broadcastToAll(type: string, data: any): void {
        this.authenticatedUsers.forEach((userSockets, userId) => {
            userSockets.forEach((ws) => {
                this.sendMessage(ws, type, data);
            });
        });
    }

    /**
     * Envoyer une notification à un utilisateur spécifique
     */
    public notifyUser(
        userId: string,
        type: 'success' | 'error' | 'warning' | 'info',
        message: string,
        titleOrData?: string | any
    ): void {
        const userSockets = this.authenticatedUsers.get(userId);
        if (userSockets) {
            userSockets.forEach((ws) => {
                // Si titleOrData est un string, c'est un titre. Sinon, c'est des données enrichies
                if (typeof titleOrData === 'string') {
                    this.sendMessage(ws, 'notification', {
                        type,
                        message,
                        title: titleOrData,
                    });
                } else {
                    // Envoyer avec les données enrichies
                    this.sendMessage(ws, 'notification', {
                        type,
                        message,
                        ...titleOrData,
                    });
                }
            });
        }
    }

    /**
     * Envoyer une notification à tous les utilisateurs connectés
     */
    public notifyAll(
        type: 'success' | 'error' | 'warning' | 'info',
        message: string,
        title?: string
    ): void {
        this.broadcastToAll('notification', {
            type,
            message,
            title,
        });
    }

    /**
     * Envoyer une notification aux admins uniquement
     */
    public notifyAdmins(
        type: 'success' | 'error' | 'warning' | 'info',
        message: string,
        title?: string
    ): void {
        this.broadcastToAdmins('notification', {
            type,
            message,
            title,
        });
    }

    /**
     * Notifier une mise à jour de données
     */
    public notifyDataUpdate(
        entity: string,
        action: 'create' | 'update' | 'delete',
        data: any,
        targetRoom: string = 'all'
    ): void {
        if (targetRoom === 'admins') {
            this.broadcastToAdmins('dataUpdate', {
                entity,
                action,
                data,
            });
        } else {
            this.broadcastToAll('dataUpdate', {
                entity,
                action,
                data,
            });
        }
    }

    /**
     * Notifier une mise à jour de profil à un utilisateur spécifique
     */
    public notifyProfileUpdate(userId: string, userData: any): void {
        const userSockets = this.authenticatedUsers.get(userId);
        if (userSockets) {
            userSockets.forEach((ws) => {
                this.sendMessage(ws, 'profileUpdate', {
                    user: userData,
                });
            });
        }
    }

    /**
     * Obtenir le nombre d'utilisateurs connectés
     */
    public getConnectedUsersCount(): number {
        return this.authenticatedUsers.size;
    }

    /**
     * Obtenir la liste des utilisateurs connectés (pour les admins)
     */
    public getConnectedUsers(): Array<{
        _id: string;
        email: string;
        role: string;
        socketsCount: number;
    }> {
        const users: Array<{ _id: string; email: string; role: string; socketsCount: number }> = [];

        this.authenticatedUsers.forEach((sockets, userId) => {
            if (sockets.length > 0) {
                const user = sockets[0].user!;
                users.push({
                    _id: user._id,
                    email: user.email,
                    role: user.role,
                    socketsCount: sockets.length,
                });
            }
        });

        return users;
    }

    /**
     * Déconnecter tous les sockets d'un utilisateur
     */
    public disconnectUser(userId: string, reason: string = 'Admin disconnect'): void {
        const userSockets = this.authenticatedUsers.get(userId);
        if (userSockets) {
            userSockets.forEach((socket) => {
                socket.close(1000, reason);
            });
            this.authenticatedUsers.delete(userId);
        }
    }

    /**
     * Envoyer les notifications en attente à un utilisateur qui vient de se connecter
     */
    private async sendPendingNotifications(userId: string): Promise<void> {
        try {
            // Import dynamique pour éviter les dépendances circulaires
            const notificationService = (await import('./notificationService')).default;
            await notificationService.sendPendingNotifications(userId);
        } catch (error) {
            console.error("❌ Erreur lors de l'envoi des notifications en attente:", error);
        }
    }
}

// Instance singleton
export const websocketService = new WebSocketService();
export default websocketService;
