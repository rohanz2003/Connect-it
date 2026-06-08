import React from "react";

function UsersSidebar({ users, currentUser, setSelectedUser }) {
  return (
    <div className="sidebar">
      <h3>Users</h3>

      {users
        .filter((u) => u !== currentUser)
        .map((user, i) => (
          <div key={i} onClick={() => setSelectedUser(user)} className="user-item">
            {user}
          </div>
        ))}
    </div>
  );
}

export default UsersSidebar;