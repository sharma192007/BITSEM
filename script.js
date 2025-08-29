// app namespace for login auth
window.appAuth = (function(){
  // admin credentials: username and password hash (sha-256 of password)
  const ADMIN_USER = 'admin';
  // SHA-256 hash of the admin password
  const ADMIN_PASS_HASH = 'd3ee82f9f12c2f8a4a4726e7522e82510c18ca9ee937703790382f57b0c61acb';

  async function sha256(message){
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function loginAdmin(username, password){
    if (!username || !password) return false;
    if (username !== ADMIN_USER) return 'username_mismatch';
    const h = await sha256(password);
    
    if (h === ADMIN_PASS_HASH) {
      return true;
    }
    return 'password_mismatch';
  }

  return { loginAdmin };
})();

// Event storage helpers
function getEvents(){ return JSON.parse(localStorage.getItem('events_v1')||'[]'); }
function saveEvents(ev){ localStorage.setItem('events_v1', JSON.stringify(ev)); }

// New utility to format date
function formatDate(dateString){
  if (!dateString) return {};
  const [year, month, day] = dateString.split('-');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return { month: months[parseInt(month, 10) - 1], day: parseInt(day, 10) };
}


// render events for a given role
function renderEvents(role){
  const grid = document.getElementById('grid');
  if(!grid) return;
  const q = (document.getElementById('search') && document.getElementById('search').value.toLowerCase())||'';
  let events = getEvents();
  // sort
  const sortBy = (document.getElementById('sortBy') && document.getElementById('sortBy').value) || 'date';
  if(sortBy==='date') events.sort((a,b)=> (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||''));
  else events.sort((a,b)=> (a.title||'').localeCompare(b.title||''));

  if(q) events = events.filter(e => (e.title||'').toLowerCase().includes(q) || (e.desc||'').toLowerCase().includes(q) );

  grid.innerHTML = '';
  events.forEach((ev, idx) => {
    const card = document.createElement('div');
    card.className = 'card-event';

    const { month, day } = formatDate(ev.date);
    const tags = (ev.tags||[]).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    
    // Determine the image source
    const imageSrc = ev.image || `https://picsum.photos/400/200?random=${Math.floor(Math.random() * 1000)}`;

    card.innerHTML = `
      <img src="${imageSrc}" alt="Event image" class="card-image">
      <div class="card-content">
        <div class="date-box">
          <div class="month">${escapeHtml(month)}</div>
          <div class="day">${escapeHtml(String(day))}</div>
        </div>
        <div class="event-info">
          <h4 class="title">${escapeHtml(ev.title||'Untitled')}</h4>
          <p class="location">📍 ${escapeHtml(ev.location||'')}</p>
        </div>
      </div>
      <div class="meta">
          <p class="desc">${escapeHtml(ev.desc||'')}</p>
      </div>
      <div class="tags">${tags}</div>
      <div class="bottom">
        <div class="actions-area"></div>
      </div>
    `;
    const actionsArea = card.querySelector('.actions-area');
    if(role === 'user'){
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = ev.attendees && ev.attendees.includes(localStorage.getItem('user')) ? 'Cancel RSVP' : 'RSVP';
      btn.onclick = () => { toggleRsvp(idx); renderEvents(role); };
      actionsArea.appendChild(btn);
    } else if(role === 'admin'){
      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.onclick = () => { openModal(ev, idx); };
      const del = document.createElement('button');
      del.className = 'btn small';
      del.textContent = 'Delete';
      del.onclick = () => { if(confirm('Delete event?')) deleteEvent(idx); };
      actionsArea.appendChild(edit);
      actionsArea.appendChild(del);
    }
    grid.appendChild(card);
  });
}

// utility escape
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'})[c]); }

// admin functions
function openModal(ev, idx){
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modalTitle').textContent = ev ? 'Edit Event' : 'Create Event';
  document.getElementById('m_title').value = ev ? ev.title : '';
  document.getElementById('m_date').value = ev ? ev.date : new Date().toISOString().slice(0,10);
  document.getElementById('m_time').value = ev ? ev.time : '12:00';
  document.getElementById('m_location').value = ev ? ev.location : '';
  document.getElementById('m_desc').value = ev ? ev.desc : '';
  document.getElementById('m_capacity').value = ev ? (ev.capacity||'') : '';
  document.getElementById('m_tags').value = ev ? (ev.tags||[]).join(', ') : '';
  // Clear file input on new event
  document.getElementById('m_image').value = '';
  // save handler
  const saveBtn = document.getElementById('m_save');
  saveBtn.onclick = function(){ saveModal(idx); };
}

function closeModal(){ document.getElementById('modal').style.display = 'none'; }

// saveModal is now asynchronous to handle file reading
async function saveModal(idx){
  const events = getEvents();
  const imageFile = document.getElementById('m_image').files[0];
  let imageData = null;

  if (imageFile) {
    const reader = new FileReader();
    imageData = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(imageFile);
    });
  }

  const payload = {
    title: document.getElementById('m_title').value.trim(),
    date: document.getElementById('m_date').value,
    time: document.getElementById('m_time').value,
    location: document.getElementById('m_location').value.trim(),
    desc: document.getElementById('m_desc').value.trim(),
    capacity: document.getElementById('m_capacity').value.trim() ? Number(document.getElementById('m_capacity').value) : null,
    tags: document.getElementById('m_tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    image: imageData || (idx != null && events[idx] ? events[idx].image : null),
    attendees: (idx!=null && events[idx]) ? events[idx].attendees || [] : []
  };
  if(idx!=null){
    events[idx] = payload;
  } else {
    events.push(payload);
  }
  saveEvents(events);
  closeModal();
  const role = localStorage.getItem('role') || 'user';
  renderEvents(role);
}

// delete
function deleteEvent(idx){
  const events = getEvents();
  events.splice(idx,1);
  saveEvents(events);
  renderEvents(localStorage.getItem('role')||'user');
}

// RSVP
function toggleRsvp(idx){
  const events = getEvents();
  const user = localStorage.getItem('user') || 'Guest';
  events[idx].attendees = events[idx].attendees || [];
  const found = events[idx].attendees.indexOf(user);
  if(found>=0) events[idx].attendees.splice(found,1);
  else events[idx].attendees.push(user);
  saveEvents(events);
}

// New Notice storage helpers
function getNotices(){ return JSON.parse(localStorage.getItem('notices_v1')||'[]'); }
function saveNotices(notices){ localStorage.setItem('notices_v1', JSON.stringify(notices)); }

// New function to format notice timestamp
function formatNoticeDate(timestamp){
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedTime = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${ampm}`;
  return `${month} ${day} at ${formattedTime}`;
}


// New function to render notices
function renderNotices(role){
  const list = document.getElementById('noticesList');
  if(!list) return;
  const notices = getNotices();
  list.innerHTML = '';
  notices.forEach((n, idx) => {
    const notice = document.createElement('div');
    notice.className = 'notice-card';
    notice.innerHTML = `
      <div class="title">${escapeHtml(n.title)}</div>
      <div class="content">${escapeHtml(n.content)}</div>
      <div class="notice-timestamp">${formatNoticeDate(n.timestamp)}</div>
    `;
    if (role === 'admin') {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn small';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => openNoticeModal(n, idx);
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn small';
      deleteBtn.textContent = 'Delete';
      deleteBtn.onclick = () => { if(confirm('Delete notice?')) deleteNotice(idx); };
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      notice.appendChild(actions);
    }
    list.appendChild(notice);
  });
}

// New admin functions for notices
function openNoticeModal(notice, idx){
  document.getElementById('noticeModal').style.display = 'flex';
  document.getElementById('noticeModalTitle').textContent = notice ? 'Edit Notice' : 'Create Notice';
  document.getElementById('n_title').value = notice ? notice.title : '';
  document.getElementById('n_content').value = notice ? notice.content : '';
  const saveBtn = document.getElementById('n_save');
  saveBtn.onclick = function(){ saveNotice(idx); };
}

function closeNoticeModal(){ document.getElementById('noticeModal').style.display = 'none'; }

function saveNotice(idx){
  const notices = getNotices();
  const payload = {
    title: document.getElementById('n_title').value.trim(),
    content: document.getElementById('n_content').value.trim(),
    timestamp: new Date().toISOString()
  };
  if(idx != null){
    notices[idx] = payload;
  } else {
    notices.unshift(payload);
  }
  saveNotices(notices);
  closeNoticeModal();
  renderNotices(localStorage.getItem('role') || 'user');
}

function deleteNotice(idx){
  const notices = getNotices();
  notices.splice(idx,1);
  saveNotices(notices);
  renderNotices(localStorage.getItem('role') || 'user');
}

// wire modal cancel & search & sorting
document.addEventListener('DOMContentLoaded', ()=>{
  const modalCancel = document.getElementById('m_cancel');
  modalCancel && (modalCancel.onclick = closeModal);

  const search = document.getElementById('search');
  if(search){ search.addEventListener('input', ()=> renderEvents(localStorage.getItem('role')||'user')); }
  const sort = document.getElementById('sortBy');
  if(sort){ sort.addEventListener('change', ()=> renderEvents(localStorage.getItem('role')||'user')); }
  
  // New modal handlers
  const noticeModalCancel = document.getElementById('n_cancel');
  if (noticeModalCancel) {
    noticeModalCancel.onclick = closeNoticeModal;
  }

  // seed sample event if none
  if(getEvents().length===0){
    saveEvents([{
      title:'Campus Coding Marathon',
      date:new Date().toISOString().slice(0,10),
      time:'10:00',
      location:'Auditorium A',
      desc:'24-hour hackathon with mini-challenges and prizes.',
      capacity:200,
      tags:['hackathon','coding'],
      attendees:[]
    }]);
  }

  // Seed with a sample notice if none exists
  if(getNotices().length === 0){
    saveNotices([{
      title:'Welcome!',
      content:'This is the first official notice. More updates will be posted here.',
      timestamp: new Date().toISOString()
    }]);
  }
});
