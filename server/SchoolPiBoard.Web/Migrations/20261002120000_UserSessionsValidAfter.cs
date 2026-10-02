using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Отзыв входов: момент, раньше которого начатые входы недействительны
/// (сброс пароля, удаление учётной записи, «Выйти на всех устройствах»).
/// Пусто у всех живых строк — значит, ничего не отзывалось.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20261002120000_UserSessionsValidAfter")]
public partial class UserSessionsValidAfter : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "sessions_valid_after",
            table: "users",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "sessions_valid_after", table: "users");
    }
}
