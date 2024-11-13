import React from 'react';
import { Link } from 'react-router-dom'
import { doIt } from '../features/callBackend';


function Header() {


  return (
    <header>
      <nav className="navbar navbar-expand-md navbar-dark fixed-top bg-dark">
        <div className="container-fluid">
          <a className="navbar-brand" href="/">site</a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarCollapse" aria-controls="navbarCollapse" aria-expanded="false" aria-label="Toggle navigation">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarCollapse">
            <ul className="navbar-nav me-auto mb-2 mb-md-0">
            <li className="nav-item">
              <button className="nav-link" data-bs-toggle="collapse" data-bs-target="#navbarCollapse" aria-controls="navbarCollapse" onClick={doIt}>backend call</button>
            </li>
            </ul>
          </div>
        </div>
      </nav>
    </header>
  );

}

export default Header;




