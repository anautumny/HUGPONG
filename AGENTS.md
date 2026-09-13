# HUGPONG Core Architecture Constraints

Treat all functional requirements and system changes as full-stack and cross-platform:

1. **Centralized Authority:**
   - Business logic, validation, and data mutations must be centralized on the server/API and persisted in the database. Clients never act as standalone authorities.

2. **Synchronous Parity:**
   - Every system update, data model alteration, or feature change must specify implementations for BOTH the Web client and Mobile client.

3. **End-to-End Delivery:**
   - When providing solutions, structure the response and implementation to cover:
     - **Database / Schema changes**
     - **Server / API / Controller updates**
     - **Web implementation**
     - **Mobile implementation**
