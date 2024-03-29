$('#web-version').text('v2021-03-25-0801');
// Variables for page parts
// Login form variables
var input_authkey = $('#authkey');
var checkbox_persistentLogin = $('#persistentLogin');
var button_login = $('#login');
var button_reconnect = $('#reconnect');

// Notification variable
var div_notification_area = $('#notificationArea');

// Other variables
var socket; // SocketIO socket
var connection_status = 'unknown'; // 'connected', 'disconnected', 'unknown'
var disconnect_reason;
var currentUser, currentUserAvatar; // Currently logged in user's name and avatar url
var currentBot, currentBotAvatar;
var guildRolesFiltered = [];

// Weekly chart variables
var weeklyVoiceHours = [];
var ctx = document.getElementById('weekly-chart').getContext('2d');
var weeklyChart = new Chart(ctx, {
    // The type of chart we want to create
    type: 'bar',
    // The data for our dataset
    data: {
        labels: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        datasets: [{
            label: 'Total Voice Hours',
            backgroundColor: 'rgba(13, 110, 253, 0.2)',
            borderColor: 'rgba(13, 110, 253, 1)',
            borderWidth: 2
        }]
    },
    // Configuration options go here
    options: {
        scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        },
        maintainAspectRatio: false,
        legend: {
            labels: {
                fontColor: 'white'
            }
        }
    }
});
weeklyChart.canvas.parentNode.style.height = '360px';

// Page events
button_login.on('click', (event) => {
    login('button');
});

button_reconnect.on('click', () => {
    socket.connect();
});

$('#add-field').on('click', (event) => {
    event.preventDefault();
    addFieldOnForm();
});

$('#send-embed').on('click', (event) => {
    event.preventDefault();
    sendEmbed();
});

$('#react-submit').on('click', () => {
    addReactRoleMessage();
});

// Socket listeners
var socket_listen_connect;
var socket_listen_disconnect;
var socket_listen_connect_error;

// Initialization
initialize_with_cookie();

// Socket related functions
function initialize_with_cookie() {
    if (existsCookie('authkey')) {
        login('cookie');
    }
}

function login(method) {
    sendNotification('primary', 'Logging in');
    // Login using log in form and button
    if (method == 'button') {
        connectToSocket(input_authkey.val(), false);
    }
    // Logging in from cookie 
    else if (method == 'cookie') {
        connectToSocket(getCookie('authkey'), true);
    }
}

function logout() {
    clearCookie('authkey', input_authkey.val());
    button_login.removeClass('disabled');
    window.location.reload();
}

function connectToSocket(authkey, reconnect) {
    socket = io.connect(location.href, {
        reconnection: reconnect,
        auth: {
            token: authkey
        }
    });

    setTimeout(() => afterLoginHandler(), 3000); // Call afterLoginHandler after 3 seconds
    socket_listen_connect = socket.on('connect', () => {
        console.log('socket connect');
        connection_status = 'connected';
    });
    socket_listen_disconnect = socket.on('disconnect', (reason) => {
        console.log('socket disconnect');
        connection_status = 'disconnected';
        disconnect_reason = reason;
    });
}

function afterLoginHandler() {
    // Check connection_status
    if (connection_status == 'connected') {
        // Perform connected actions
        sendNotification('success', 'Log in successful');
        handleSuccessfulConnect();
        initListeners();
        button_login.addClass('disabled');
        if (checkbox_persistentLogin.prop('checked')) {
            setCookie('authkey', input_authkey.val());
        }
    }
    else if (connection_status == 'disconnected') {
        if (disconnect_reason == 'io server disconnect') {
            sendNotification('danger', 'Failed to log in - please check your password');
        }
    }
}

// Define listeners to add here and socket events
function initListeners() {
    socket_listen_connect = socket.on('connect', () => {
        handleSuccessfulReconnect();
    });

    socket_listen_disconnect = socket.on('disconnect', (reason) => {
        // Handle connection loss
        if (reason == 'transport close') sendNotification('danger', 'Connection to server lost');
        handleConnectionLoss();
    });

    socket_listen_connect_error = socket.on('connect_error', (reason) => {

    });

    socket.on('reply', (type, data) => {
        if (type == 'connection-info') {
            let temp = JSON.parse(data);
            currentUser = temp.user;
            currentUserAvatar = temp.user_avatar;
            currentBot = temp.bot;
            currentBotAvatar = temp.bot_avatar;
            $('#server-avatar').attr('src', temp.server_avatar);
            $('#server-name').text(temp.server);
            $('#bot-avatar').attr('src', temp.bot_avatar);
            $('#bot-name').text(temp.bot);
            $('#user-avatar').attr('src', temp.user_avatar);
            $('#user-name').text(temp.user);
            $('#server-version').text(temp.server_version);
        }

        if (type == 'guild-text-channels') {
            let temp = JSON.parse(data);
            let selector = $('.channel-picker');
            selector.html('');
            temp.forEach(channel => {
                selector.append(`
                    <option value="${channel.id}">${channel.name}</option>
                `);
            });
        }

        if (type == 'voice-hours') {
            let tableBody = $('#voice-hours');
            tableBody.html("");
            let voiceHours = JSON.parse(data);
            console.log(voiceHours);
            if (voiceHours.length > 0) {
                for (let i = 0; i < voiceHours.length; i++) {
                    let member = voiceHours[i];
                    let toAppend = `
                    <tr>
                        <th scope="row">${i + 1}</th>
                        <td><img class="rounded-circle avatar" id="member-avatar" src="${member.avatarURL}">&Tab;${member.displayName}</td>
                        <td>${member.time}</td>
                    </tr>
                    `;
                    tableBody.append(toAppend);
                }
            }
        }

        if (type == 'weekly-voice-hours') {
            weeklyVoiceHours = JSON.parse(data);
            weeklyChart.data.datasets[0].data = weeklyVoiceHours;
            weeklyChart.update();
        }

        if (type == 'guild-roles-filtered') {
            guildRolesFiltered = JSON.parse(data);
            setReactRolePicker();
        }
    });
}

function handleSuccessfulConnect() {
    $('#connStatusTitle').text('Connected');
    $('#server-info-box').css('display', '');
    button_reconnect.css('display', 'none');
    $('#nav-profile-tab').removeClass('disabled');
    $('#nav-contact-tab').removeClass('disabled');
    $('#nav-react-tab').removeClass('disabled');
    socket.emit('get', 'connection-info');
    socket.emit('get', 'guild-text-channels');
    socket.emit('get', 'voice-hours');
    socket.emit('get', 'weekly-voice-hours');
    socket.emit('get', 'guild-roles-filtered');
}

function handleSuccessfulReconnect() {
    sendNotification('success', 'Reconnected successfully');
    handleSuccessfulConnect();
}

function handleConnectionLoss() {
    $('#connStatusTitle').text('Disconnected');
    $('#server-info-box').css('display', 'none');
    button_reconnect.css('display', '');
    $('#nav-profile-tab').addClass('disabled');
    $('#nav-contact-tab').addClass('disabled');
    $('#nav-react-tab').addClass('disabled');
}

// Webpage related functions
// type bootstrap colors: primary, secondary, success, danger, warning, info, light, dark
function sendNotification(color, message) {
    div_notification_area.html(`
    <div class="alert alert-${color} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
    `);
}

function voiceHoursRefresh() {
    socket.emit('get', 'voice-hours');
    socket.emit('get', 'weekly-voice-hours');
}

function useUserInfo() {
    $('#author').val(currentUser);
    $('#author-avatar-url').val(currentUserAvatar);
}

function useBotInfo() {
    $('#footer-text').val(currentBot);
    $('#footer-icon-url').val(currentBotAvatar);
}

var current_field_counter = 1;
function addFieldOnForm() {
    console.log('add field on form');
    let toAppend = $('#main-table');
    current_field_counter++;
    let tempField = `
    <tr id="field-${current_field_counter}a" style="background-color: #555;">
    <td colspan="2">
      <label for="field-title-${current_field_counter}" class="form-label">Field title</label>
      <div class="input-group mb-3">
          <input type="text" class="form-control" id="field-title-${current_field_counter}" aria-describedby="button-addon${current_field_counter + 4}">
          <select style="max-width: 120px;" name="" id="field-inline-${current_field_counter}" class="form-select">
            <option value="false">Regular</option>
            <option value="true">Inline</option>
          </select>
          <button class="btn btn-danger" onclick="removeFieldOnForm(${current_field_counter})" type="button" id="button-addon${current_field_counter + 4} remove-field">Remove
            field</button>
        </div>
      </td>
    </tr>
    <tr id="field-${current_field_counter}b" style="background-color: #555;">
        <td colspan="2">
            <label for="field-text-${current_field_counter}" class="form-label">Field text</label>
            <textarea class="form-control" name="field-text-${current_field_counter}" id="field-text-${current_field_counter}" rows="2"></textarea>
        </td>
    </tr>`;
    toAppend.append(tempField);
}

function removeFieldOnForm(field_num) {
    console.log(field_num);
    $(`#field-${field_num}a`).remove();
    $(`#field-${field_num}b`).remove();
}

var current_roles_counter = 1;
function addReactRoleField() {
    let toAppend = $('#react-main-table');
    current_roles_counter++;
    let tempField = `
    <tr id="react-role-${current_roles_counter}">
        <td colspan="2">
            <label for="field-title-${current_roles_counter}" class="form-label">React Role</label>
            <div class="input-group mb-3">
                <input style="max-width: 150px;" type="text" class="form-control" id="react-emoji-${current_roles_counter}"
                placeholder="Emoji">
                <input type="text" class="form-control" id="react-role-description-${current_roles_counter}"
                placeholder="Role Description (Can be left empty to use role name)">
                <select style="max-width: 200px;" id="react-role-select-${current_roles_counter}" class="react-role-select form-select">
                <option value="" disabled selected>Select role</option>
                <option value="-1">Test</option>
                </select>
                <button id="react-add-role" class="btn btn-danger" onclick="removeReactRoleField(${current_roles_counter})" type="button">Remove role</button>
            </div>
        </td>
    </tr>`;
    toAppend.append(tempField);
    setReactRolePicker();
}

function removeReactRoleField(field_num) {
    console.log(field_num);
    $(`#react-role-${field_num}`).remove();
}

function setReactRolePicker() {
    let selector = $('.react-role-select')
    selector.html('');
    guildRolesFiltered.forEach(role => {
        selector.append(`
            <option value="${role.id}">${role.name}</option>
        `);
    });
}

function sendEmbed() {
    let embedObject = {
        author: $('#author').val(),
        author_avatar_url: $('#author-avatar-url').val(),
        title: $('#title').val(),
        content_text: $('#content-text').val(),
        thumbnail_url: $('#thumbnail-url').val(),
        fields: [], // Will be added later
        main_image_url: $('#main-image-url').val(),
        footer_text: $('#footer-text').val(),
        footer_icon_url: $('#footer-icon-url').val(),
        color_hex: $('#select-color').val(),
        channel_id: $('#select-channel').val()
    }
    for (let i = 1; i <= current_field_counter; i++) {
        let title = $(`#field-title-${i}`).val();
        let text = $(`#field-text-${i}`).val();
        let inline = $(`#field-inline-${i}`).val();
        let field = {
            title: title,
            text: text,
            inline: inline
        }
        embedObject.fields.push(field);
    }
    console.log(embedObject);
    socket.emit('send', 'embed', JSON.stringify(embedObject));
}

function addReactRoleMessage() {
    // Add channel id too
    let reactMessage = {
        title: $('#react-title').val(),
        content_text: $('#react-text').val(),
        channel_id: $('#react-select-channel').val(),
        react_roles: []
    }
    for (let i = 1; i <= current_roles_counter; i++) {
        let reactRole = {
            emoji: $(`#react-emoji-${i}`).val(),
            description: '',
            role_id: $(`#react-role-select-${i}`).val()
        }
        let tempDesc = $(`#react-role-description-${i}`).val();
        if (!tempDesc) {
            if (tempDesc.length == 0) reactRole.description = $(`#react-role-select-${i} option:selected`).text();
        } else {
            reactRole.description = $(`#react-role-description-${i}`).val();
        }
        reactMessage.react_roles.push(reactRole);
    }
    socket.emit('send', 'react-role-message', JSON.stringify(reactMessage));
}

// Code from w3schools
// https://www.w3schools.com/js/js_cookies.asp
function setCookie(cname, cvalue) {
    var expires = (new Date(Date.now()+ 604800*1000)).toUTCString(); // 7 Days
    document.cookie = cname + "=" + cvalue + ";" + ` expires=${expires}; path=/`;

}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function existsCookie(cname) {
    return getCookie(cname).length > 0;
}

function clearCookie(cname) {
    document.cookie = cname + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}