import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "../styles/Header.css";

const Header = ({ isLanding = false }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLinkClick = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo/Brand */}
        <Link to="/" className="header-logo" onClick={handleLinkClick}>
          <span className="logo-icon">💬</span>
          <span className="logo-text">Connect It</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="header-nav desktop-nav">
          <a href="#about" className="nav-link">
            About
          </a>
          <Link to="/login" className="nav-link">
            Login
          </Link>
          <Link to="/login" className="nav-button">
            Get Started
          </Link>
        </nav>

        {/* Mobile Menu Button */}
        <button className="menu-toggle" onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="header-nav mobile-nav">
            <a href="#about" className="nav-link" onClick={handleLinkClick}>
              About
            </a>
            <Link to="/login" className="nav-link" onClick={handleLinkClick}>
              Login
            </Link>
            <Link to="/login" className="nav-button" onClick={handleLinkClick}>
              Get Started
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
