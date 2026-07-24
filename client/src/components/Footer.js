import React from "react";
import "../styles/Footer.css";

const Footer = ({ isMobile = false, onMobileNav = null }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h3 className="footer-title">Connect It</h3>
            <p className="footer-description">
              Real-time chat application for seamless communication
            </p>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Quick Links</h4>
            <ul className="footer-links">
              <li>
                {isMobile && onMobileNav ? (
                  <button className="footer-link-btn" onClick={() => onMobileNav("about")}>About</button>
                ) : (
                  <a href="#about">About</a>
                )}
              </li>
              <li>
                <a href="/login">Login</a>
              </li>
              <li>
                <a href="/login">Register</a>
              </li>
            </ul>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Features</h4>
            <ul className="footer-links">
              <li>
                <a href="#about">Real-time Messaging</a>
              </li>
              <li>
                <a href="#about">Secure Chat</a>
              </li>
              <li>
                <a href="#about">Online Status</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-divider"></div>

        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; {currentYear} Connect It. All rights reserved.
          </p>
          <p className="footer-tagline">
            Connect with anyone, anytime, anywhere 🚀
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
