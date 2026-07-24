/**
 * PROPERTY MANAGEMENT MODULE
 * Handles all property CRUD operations and Firebase integration
 * Works with the existing dashboard.js
 */

// Firebase reference
let db = firebase.firestore();

// Property form modal management
function openPropertyModal(propertyId = null) {
    const modal = document.getElementById('property-modal');
    if (!modal) createPropertyModal();
    
    const form = document.getElementById('property-form');
    form.reset();
    
    if (propertyId) {
        // Edit mode
        loadPropertyData(propertyId);
        document.querySelector('#property-modal .modal-header h3').textContent = 'Edit Property';
    } else {
        // Add mode
        document.querySelector('#property-modal .modal-header h3').textContent = 'Add New Property';
        document.getElementById('property-id').value = '';
    }
    
    document.getElementById('property-modal').classList.add('active');
}

function closePropertyModal() {
    const modal = document.getElementById('property-modal');
    if (modal) modal.classList.remove('active');
}

async function loadPropertyData(propertyId) {
    try {
        const doc = await db.collection('properties').doc(propertyId).get();
        if (doc.exists) {
            const data = doc.data();
            populatePropertyForm(propertyId, data);
        }
    } catch (error) {
        console.error('Error loading property:', error);
        showToast('Error loading property data', 'error');
    }
}

function populatePropertyForm(propertyId, data) {
    document.getElementById('property-id').value = propertyId;
    document.getElementById('property-name').value = data.name || '';
    document.getElementById('property-type').value = data.type || '';
    document.getElementById('property-county').value = data.county || '';
    document.getElementById('property-town').value = data.town || '';
    document.getElementById('property-address').value = data.address || '';
    document.getElementById('property-price').value = data.price || '';
    document.getElementById('property-discount-price').value = data.discountPrice || '';
    document.getElementById('property-description').value = data.description || '';
    document.getElementById('property-max-guests').value = data.maxGuests || '';
    document.getElementById('property-bedrooms').value = data.bedrooms || '';
    document.getElementById('property-bathrooms').value = data.bathrooms || '';
    document.getElementById('property-beds').value = data.beds || '';
    document.getElementById('property-size').value = data.size || '';
    document.getElementById('property-checkin').value = data.checkinTime || '14:00';
    document.getElementById('property-checkout').value = data.checkoutTime || '11:00';
    document.getElementById('property-status').value = data.status || 'available';
    document.getElementById('property-featured').checked = data.featured || false;
    document.getElementById('property-amenities').value = (data.amenities || []).join(', ');
    document.getElementById('property-rules').value = data.houseRules || '';
    document.getElementById('property-cancellation').value = data.cancellationPolicy || '';
    document.getElementById('property-maps-url').value = data.mapsUrl || '';
}

async function saveProperty(e) {
    e.preventDefault();
    
    const propertyId = document.getElementById('property-id').value;
    const propertyData = {
        name: document.getElementById('property-name').value.trim(),
        type: document.getElementById('property-type').value,
        county: document.getElementById('property-county').value.trim(),
        town: document.getElementById('property-town').value.trim(),
        address: document.getElementById('property-address').value.trim(),
        price: parseFloat(document.getElementById('property-price').value) || 0,
        discountPrice: parseFloat(document.getElementById('property-discount-price').value) || 0,
        description: document.getElementById('property-description').value.trim(),
        maxGuests: parseInt(document.getElementById('property-max-guests').value) || 1,
        bedrooms: parseInt(document.getElementById('property-bedrooms').value) || 0,
        bathrooms: parseInt(document.getElementById('property-bathrooms').value) || 0,
        beds: parseInt(document.getElementById('property-beds').value) || 0,
        size: parseInt(document.getElementById('property-size').value) || 0,
        checkinTime: document.getElementById('property-checkin').value,
        checkoutTime: document.getElementById('property-checkout').value,
        status: document.getElementById('property-status').value,
        featured: document.getElementById('property-featured').checked,
        amenities: document.getElementById('property-amenities').value.split(',').map(a => a.trim()),
        houseRules: document.getElementById('property-rules').value.trim(),
        cancellationPolicy: document.getElementById('property-cancellation').value.trim(),
        mapsUrl: document.getElementById('property-maps-url').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Validation
    if (!propertyData.name || !propertyData.type || !propertyData.price) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const btn = document.querySelector('#property-form button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        if (propertyId) {
            // Update existing
            await db.collection('properties').doc(propertyId).update(propertyData);
            showToast('Property updated successfully', 'success');
        } else {
            // Create new
            propertyData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('properties').add(propertyData);
            showToast('Property created successfully', 'success');
        }
        
        closePropertyModal();
        loadPropertiesTable();
        btn.disabled = false;
        btn.textContent = 'Save Property';
    } catch (error) {
        console.error('Error saving property:', error);
        showToast('Error saving property: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Save Property';
    }
}

async function deleteProperty(propertyId) {
    if (!confirm('Are you sure you want to delete this property? This cannot be undone.')) return;
    
    try {
        await db.collection('properties').doc(propertyId).delete();
        showToast('Property deleted successfully', 'success');
        loadPropertiesTable();
    } catch (error) {
        console.error('Error deleting property:', error);
        showToast('Error deleting property', 'error');
    }
}

async function archiveProperty(propertyId, currentStatus) {
    const newStatus = currentStatus === 'archived' ? 'available' : 'archived';
    try {
        await db.collection('properties').doc(propertyId).update({ status: newStatus });
        showToast(`Property ${newStatus}`, 'success');
        loadPropertiesTable();
    } catch (error) {
        console.error('Error archiving property:', error);
        showToast('Error updating property status', 'error');
    }
}

async function duplicateProperty(propertyId) {
    try {
        const doc = await db.collection('properties').doc(propertyId).get();
        if (doc.exists) {
            const data = doc.data();
            delete data.createdAt;
            delete data.updatedAt;
            data.name = data.name + ' (Copy)';
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await db.collection('properties').add(data);
            showToast('Property duplicated successfully', 'success');
            loadPropertiesTable();
        }
    } catch (error) {
        console.error('Error duplicating property:', error);
        showToast('Error duplicating property', 'error');
    }
}

async function loadPropertiesTable() {
    try {
        const snapshot = await db.collection('properties').orderBy('createdAt', 'desc').get();
        const tbody = document.getElementById('properties-table-body');
        
        if (!tbody) return; // Table not loaded yet
        
        tbody.innerHTML = '';
        
        let stats = {
            total: 0,
            available: 0,
            occupied: 0,
            pending: 0,
            maintenance: 0,
            featured: 0
        };
        
        snapshot.forEach(doc => {
            const data = doc.data();
            stats.total++;
            if (data.status === 'available') stats.available++;
            else if (data.status === 'occupied') stats.occupied++;
            else if (data.status === 'pending') stats.pending++;
            else if (data.status === 'maintenance') stats.maintenance++;
            if (data.featured) stats.featured++;
            
            const row = document.createElement('tr');
            const statusColor = {
                'available': '#4caf50',
                'occupied': '#ff9800',
                'pending': '#ffc107',
                'maintenance': '#f44336',
                'archived': '#999'
            };
            
            row.innerHTML = `
                <td>${data.name}</td>
                <td>${data.type}</td>
                <td>${data.town}, ${data.county}</td>
                <td>KSh ${data.price.toLocaleString()}</td>
                <td>
                    <select onchange="updatePropertyStatus('${doc.id}', this.value)" style="padding: 6px; border-radius: 4px; border: 1px solid #ddd;">
                        <option value="available" ${data.status === 'available' ? 'selected' : ''}>Available</option>
                        <option value="occupied" ${data.status === 'occupied' ? 'selected' : ''}>Occupied</option>
                        <option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="maintenance" ${data.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                        <option value="archived" ${data.status === 'archived' ? 'selected' : ''}>Archived</option>
                    </select>
                </td>
                <td>${data.featured ? '⭐ Yes' : 'No'}</td>
                <td>
                    <button onclick="openPropertyModal('${doc.id}')" class="btn btn-sm" style="background: #2196F3; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
                    <button onclick="duplicateProperty('${doc.id}')" class="btn btn-sm" style="background: #673ab7; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; margin: 0 4px;">Duplicate</button>
                    <button onclick="deleteProperty('${doc.id}')" class="btn btn-sm" style="background: #f44336; color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Update stats display
        updatePropertyStats(stats);
        
    } catch (error) {
        console.error('Error loading properties:', error);
        showToast('Error loading properties', 'error');
    }
}

function updatePropertyStats(stats) {
    document.getElementById('total-properties').textContent = stats.total;
    document.getElementById('available-properties').textContent = stats.available;
    document.getElementById('occupied-properties').textContent = stats.occupied;
    document.getElementById('pending-properties').textContent = stats.pending;
    document.getElementById('maintenance-properties').textContent = stats.maintenance;
    document.getElementById('featured-properties').textContent = stats.featured;
}

async function updatePropertyStatus(propertyId, newStatus) {
    try {
        await db.collection('properties').doc(propertyId).update({ status: newStatus });
        showToast(`Property status updated to ${newStatus}`, 'success');
        loadPropertiesTable();
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Error updating status', 'error');
    }
}

function createPropertyModal() {
    const modal = document.createElement('div');
    modal.id = 'property-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="background:#fff;border-radius:14px;padding:2rem;width:100%;max-width:800px;margin:1rem;max-height:90vh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;">
                <h3 style="margin:0;"><i class="fas fa-building"></i> Add New Property</h3>
                <button onclick="closePropertyModal()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#666;line-height:1;">&times;</button>
            </div>
            <form id="property-form" onsubmit="saveProperty(event)">
                <input type="hidden" id="property-id">
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Property Name <span style="color:red;">*</span></label>
                        <input type="text" id="property-name" required style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Property Type <span style="color:red;">*</span></label>
                        <select id="property-type" required style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                            <option value="">Select Type</option>
                            <option value="studio">Studio Apartment</option>
                            <option value="1bedroom">1 Bedroom</option>
                            <option value="2bedroom">2 Bedroom</option>
                            <option value="3bedroom">3 Bedroom</option>
                            <option value="4bedroom">4 Bedroom</option>
                            <option value="maisonette">Maisonette</option>
                            <option value="villa">Villa</option>
                            <option value="townhouse">Townhouse</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">County</label>
                        <input type="text" id="property-county" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Town / Area</label>
                        <input type="text" id="property-town" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Physical Address</label>
                    <input type="text" id="property-address" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Google Maps URL (embed link)</label>
                    <input type="url" id="property-maps-url" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Price Per Night (KSh) <span style="color:red;">*</span></label>
                        <input type="number" id="property-price" required min="0" step="100" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Discount Price (KSh)</label>
                        <input type="number" id="property-discount-price" min="0" step="100" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Description</label>
                    <textarea id="property-description" rows="3" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;font-family:inherit;"></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Max Guests</label>
                        <input type="number" id="property-max-guests" min="1" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Bedrooms</label>
                        <input type="number" id="property-bedrooms" min="0" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Bathrooms</label>
                        <input type="number" id="property-bathrooms" min="0" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Beds</label>
                        <input type="number" id="property-beds" min="0" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Property Size (sqm)</label>
                    <input type="number" id="property-size" min="0" step="0.1" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Check-in Time</label>
                        <input type="time" id="property-checkin" value="14:00" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Check-out Time</label>
                        <input type="time" id="property-checkout" value="11:00" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Amenities (comma-separated)</label>
                    <input type="text" id="property-amenities" placeholder="WiFi, Air Conditioning, Kitchen, etc." style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">House Rules</label>
                    <textarea id="property-rules" rows="2" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;font-family:inherit;"></textarea>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Cancellation Policy</label>
                    <textarea id="property-cancellation" rows="2" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;font-family:inherit;"></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display:block;font-weight:600;margin-bottom:0.35rem;">Status</label>
                        <select id="property-status" style="width:100%;padding:0.65rem;border:1.5px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                            <option value="available">Available</option>
                            <option value="occupied">Occupied</option>
                            <option value="pending">Pending Approval</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="archived">Archived</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="display:flex;align-items:center;font-weight:600;margin-top:1.5rem;cursor:pointer;">
                            <input type="checkbox" id="property-featured" style="margin-right:0.5rem;cursor:pointer;">
                            Featured Property
                        </label>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary" style="width:100%;padding:0.85rem;font-size:0.95rem;background:#800000;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-save"></i> Save Property
                </button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Create modal and load properties when properties section is accessed
    const observer = new MutationObserver(() => {
        const propertiesSection = document.getElementById('properties-section');
        if (propertiesSection && propertiesSection.classList.contains('active')) {
            if (!document.getElementById('properties-table-body')) {
                createPropertiesTable();
                loadPropertiesTable();
            }
        }
    });
    
    observer.observe(document.body, { attributes: true, subtree: true });
});

function createPropertiesTable() {
    const section = document.getElementById('properties-section');
    if (!section || section.querySelector('table')) return;
    
    const html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #800000;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Total Properties</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #800000;" id="total-properties">0</h3>
            </div>
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #4caf50;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Available</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #4caf50;" id="available-properties">0</h3>
            </div>
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ff9800;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Occupied</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #ff9800;" id="occupied-properties">0</h3>
            </div>
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ffc107;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Pending</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #ffc107;" id="pending-properties">0</h3>
            </div>
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #f44336;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Maintenance</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #f44336;" id="maintenance-properties">0</h3>
            </div>
            <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #2196f3;">
                <p style="margin: 0; color: #666; font-size: 0.9rem;">Featured</p>
                <h3 style="margin: 0.5rem 0 0; font-size: 2rem; color: #2196f3;" id="featured-properties">0</h3>
            </div>
        </div>

        <button class="btn btn-primary" onclick="openPropertyModal()" style="margin-bottom: 1.5rem; background: #800000; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
            <i class="fas fa-plus"></i> Add New Property
        </button>

        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Property Name</th>
                        <th>Type</th>
                        <th>Location</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Featured</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="properties-table-body">
                    <tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    section.innerHTML = html;
}
