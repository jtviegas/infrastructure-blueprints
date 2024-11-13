import React from 'react';

export class AlertType {
  static PRIMARY = 'primary';
  static SECONDARY = 'secondary';
  static SUCCESS = 'success';
  static DANGER = 'danger';
  static WARNING = 'warning';
  static INFO = 'info';
  static LIGHT = 'light';
  static DARK = 'dark';
}

export const pushAlert = (message, alertType) => {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = [
    `<div class="alert alert-${alertType} alert-dismissible" role="alert">`,
    `   <div>${message}</div>`,
    '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
    '</div>'
  ].join('')
  const alertPlaceholder = document.getElementById('alertPlaceholder')
  alertPlaceholder.append(wrapper)
}

function Alert() {
  return (
    <div className="alertbox">
      <div className="container" id="alertPlaceholder"></div>
    </div>
  );
}

export default Alert;
