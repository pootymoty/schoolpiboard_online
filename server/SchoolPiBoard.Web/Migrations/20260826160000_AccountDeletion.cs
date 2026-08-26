using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SchoolPiBoard.Web.Data;

#nullable disable

namespace SchoolPiBoard.Web.Migrations;

/// <summary>
/// Удаление учётной записи — раздел о профиле.
///
/// Строка не удаляется сразу: доски должны остаться рабочими для остальных
/// участников ещё полгода. Признак «удалено» — обычная мягкая пометка,
/// как и у доски; окончательную зачистку по сроку делает фоновая служба,
/// а не эта миграция.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260826160000_AccountDeletion")]
public partial class AccountDeletion : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "deleted_at",
            table: "users",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "deleted_at",
            table: "users");
    }
}
