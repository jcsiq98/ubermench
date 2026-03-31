const { Server } = require('socket.io');
const { redisClient } = require('./redis');
const { db } = require('./database');

class SocketService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.id}`);

      // Handle user authentication
      socket.on('authenticate', async (data) => {
        try {
          const { userId, role } = data;
          socket.userId = userId;
          socket.role = role;
          
          // Join user-specific room
          socket.join(`user:${userId}`);
          
          // If provider, join provider room
          if (role === 'provider') {
            socket.join('providers');
            await this.updateProviderOnlineStatus(userId, true);
          }
          
          socket.emit('authenticated', { success: true });
        } catch (error) {
          socket.emit('error', { message: 'Authentication failed' });
        }
      });

      // Handle location updates
      socket.on('location_update', async (data) => {
        try {
          const { lat, lng } = data;
          
          if (socket.role === 'provider') {
            await this.updateProviderLocation(socket.userId, lat, lng);
            
            // Broadcast location to customers who have active requests
            socket.to('providers').emit('provider_location_update', {
              providerId: socket.userId,
              lat,
              lng
            });
          }
          
          // Store location in Redis for quick access
          await redisClient.setex(
            `location:${socket.userId}`, 
            300, // 5 minutes TTL
            JSON.stringify({ lat, lng, timestamp: Date.now() })
          );
        } catch (error) {
          console.error('Location update error:', error);
        }
      });

      // Handle service request creation
      socket.on('create_request', async (data) => {
        try {
          const { serviceType, lat, lng, address, description } = data;
          
          // Create service request in database
          const [request] = await db('service_requests').insert({
            customer_id: socket.userId,
            service_type: serviceType,
            status: 'created',
            origin_lat: lat,
            origin_lng: lng,
            address,
            description,
            created_at: new Date()
          }).returning('*');

          // Start matching process
          await this.startMatchingProcess(request);
          
          socket.emit('request_created', request);
        } catch (error) {
          socket.emit('error', { message: 'Failed to create request' });
        }
      });

      // Handle provider accepting request
      socket.on('accept_request', async (data) => {
        try {
          const { requestId } = data;
          
          // Update request status
          await db('service_requests')
            .where({ id: requestId })
            .update({
              provider_id: socket.userId,
              status: 'provider_assigned',
              accepted_at: new Date()
            });

          // Notify customer
          const request = await db('service_requests')
            .where({ id: requestId })
            .first();
            
          this.io.to(`user:${request.customer_id}`).emit('provider_assigned', {
            requestId,
            providerId: socket.userId
          });
          
          socket.emit('request_accepted', { requestId });
        } catch (error) {
          socket.emit('error', { message: 'Failed to accept request' });
        }
      });

      // Handle request status updates
      socket.on('update_request_status', async (data) => {
        try {
          const { requestId, status } = data;
          
          await db('service_requests')
            .where({ id: requestId })
            .update({ 
              status,
              updated_at: new Date()
            });

          // Notify relevant parties
          const request = await db('service_requests')
            .where({ id: requestId })
            .first();
            
          this.io.to(`user:${request.customer_id}`).emit('request_status_update', {
            requestId,
            status
          });
          
          if (request.provider_id) {
            this.io.to(`user:${request.provider_id}`).emit('request_status_update', {
              requestId,
              status
            });
          }
        } catch (error) {
          socket.emit('error', { message: 'Failed to update request status' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (socket.role === 'provider' && socket.userId) {
          await this.updateProviderOnlineStatus(socket.userId, false);
        }
      });
    });
  }

  async startMatchingProcess(request) {
    try {
      // Find nearby available providers
      const providers = await db('providers')
        .where('is_online', true)
        .whereRaw(`
          ST_DWithin(
            ST_Point(lng, lat)::geography,
            ST_Point(?, ?)::geography,
            ?
          )
        `, [request.origin_lng, request.origin_lat, 5000]) // 5km radius
        .whereRaw(`service_types @> ?`, [JSON.stringify([request.service_type])])
        .orderByRaw(`
          ST_Distance(
            ST_Point(lng, lat)::geography,
            ST_Point(?, ?)::geography
          )
        `, [request.origin_lng, request.origin_lat])
        .limit(5);

      if (providers.length === 0) {
        // No providers available
        await db('service_requests')
          .where({ id: request.id })
          .update({ status: 'cancelled' });
          
        this.io.to(`user:${request.customer_id}`).emit('no_providers_available', {
          requestId: request.id
        });
        return;
      }

      // Send request to providers
      for (const provider of providers) {
        this.io.to(`user:${provider.user_id}`).emit('new_request', {
          requestId: request.id,
          serviceType: request.service_type,
          address: request.address,
          description: request.description,
          lat: request.origin_lat,
          lng: request.origin_lng,
          distance: this.calculateDistance(
            request.origin_lat,
            request.origin_lng,
            provider.lat,
            provider.lng
          )
        });
      }

      // Set timeout for provider response
      setTimeout(async () => {
        const updatedRequest = await db('service_requests')
          .where({ id: request.id })
          .first();
          
        if (updatedRequest.status === 'created') {
          await this.startMatchingProcess(request);
        }
      }, 30000); // 30 seconds timeout

    } catch (error) {
      console.error('Matching process error:', error);
    }
  }

  async updateProviderLocation(userId, lat, lng) {
    await db('providers')
      .where({ user_id: userId })
      .update({
        lat,
        lng,
        last_seen_at: new Date()
      });
  }

  async updateProviderOnlineStatus(userId, isOnline) {
    await db('providers')
      .where({ user_id: userId })
      .update({ is_online: isOnline });
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = SocketService;


