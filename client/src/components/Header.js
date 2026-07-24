import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "../styles/Header.css";

const Header = ({ isLanding = false, mobileSection = null, onMobileNav = null }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleNavClick = (section) => {
    setIsMenuOpen(false);
    if (onMobileNav) onMobileNav(section);
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* Logo/Brand */}
        <Link to="/" className="header-logo">
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
        <nav className={`header-nav mobile-nav ${isMenuOpen ? "open" : ""}`}>
          <button className="nav-link" onClick={() => handleNavClick("about")}>
            About
          </button>
          <button className="nav-link" onClick={() => handleNavClick("insights")}>
            Live Insights
          </button>
          <Link to="/login" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            Login
          </Link>
          <Link to="/login" className="nav-button" onClick={() => setIsMenuOpen(false)}>
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
