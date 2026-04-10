from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


class DayType(str, Enum):
    WORKING = "working"
    WEEKEND = "weekend"
    HOLIDAY = "holiday"


class Status(str, Enum):
    ASSIGNED = "assigned"
    PENDING = "pending"
    MODIFIED = "modified"
    VACANT = "vacant"


class AvailabilityType(str, Enum):
    LEAVE = "leave"
    OFFICIAL_DUTY = "official_duty"


# Staff schemas
class StaffBase(BaseModel):
    name: str
    active: bool = True
    join_date: Optional[date] = None
    relieve_date: Optional[date] = None


class StaffCreate(StaffBase):
    pass


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    duty_debt: Optional[int] = None
    join_date: Optional[date] = None
    relieve_date: Optional[date] = None
    privilege_mode: Optional[bool] = None


class StaffOut(StaffBase):
    id: int
    abbreviation: str
    weekday_pointer: int
    holiday_pointer: int
    total_working_duties: int
    total_holiday_duties: int
    duty_debt: int
    working_debt: int = 0
    holiday_debt: int = 0
    privilege_mode: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Availability schemas
class AvailabilityBase(BaseModel):
    staff_id: int
    start_date: date
    end_date: date
    availability_type: AvailabilityType = AvailabilityType.LEAVE
    reason: Optional[str] = None


class AvailabilityCreate(AvailabilityBase):
    pass


class AvailabilityUpdate(AvailabilityBase):
    pass


class AvailabilityOut(AvailabilityBase):
    id: int
    created_at: Optional[datetime] = None
    staff: Optional[StaffOut] = None

    class Config:
        from_attributes = True


# Calendar schemas
class CalendarBase(BaseModel):
    date: date
    day_type: DayType
    is_holiday: bool = False
    holiday_name: Optional[str] = None


class CalendarCreate(CalendarBase):
    pass


class CalendarUpdate(BaseModel):
    day_type: Optional[DayType] = None
    is_holiday: Optional[bool] = None
    holiday_name: Optional[str] = None
    assigned_duty_id: Optional[int] = None
    assigned_standby_id: Optional[int] = None
    status: Optional[Status] = None
    remarks: Optional[str] = None


class CalendarOut(CalendarBase):
    id: int
    assigned_duty_id: Optional[int] = None
    assigned_standby_id: Optional[int] = None
    status: Status
    remarks: Optional[str] = None
    duty_staff: Optional[StaffOut] = None
    standby_staff: Optional[StaffOut] = None

    class Config:
        from_attributes = True


# Roster generation schemas
class GenerateRosterRequest(BaseModel):
    year: int
    month: int
    force_regenerate: bool = False


class RosterSettingsBase(BaseModel):
    org_name: Optional[str] = None
    unit: Optional[str] = None
    auto_assign_standby: bool = True
    separate_weekend_pool: bool = True
    gap_hours: int = 24
    leave_rejoin_buffer_days: int = 2
    official_duty_min_buffer_days: int = 2
    official_duty_comfort_buffer_days: int = 4
    comfort_unavailability_threshold: int = 12


class RosterSettingsOut(RosterSettingsBase):
    id: int

    class Config:
        from_attributes = True


# Audit / Stats schemas
class StaffStats(BaseModel):
    staff: StaffOut
    working_duties: int
    holiday_duties: int
    total_duties: int


class AuditReport(BaseModel):
    month: int
    year: int
    stats: List[StaffStats]
    max_duties: int
    min_duties: int
    variance: int
    imbalance_warning: bool


class RemarkOut(BaseModel):
    id: int
    message: str
    level: str
    date_ref: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SwapRequest(BaseModel):
    first_date: date
    second_date: date
    reason: Optional[str] = None


class SwapLogOut(BaseModel):
    id: int
    first_date: date
    second_date: date
    first_staff_id_before: int
    second_staff_id_before: int
    first_staff_id_after: int
    second_staff_id_after: int
    reason: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HolidayMark(BaseModel):
    date: date
    holiday_name: Optional[str] = "Closed Holiday"
    is_holiday: bool = True


# Setup / Onboarding schemas
class SetupStatusOut(BaseModel):
    is_configured: bool
    has_staff: bool
    org_name: Optional[str] = None
    unit: Optional[str] = None


class SetupStaffEntry(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    active: bool = True
    join_date: Optional[date] = None
    relieve_date: Optional[date] = None


class SetupInitializeRequest(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=200)
    unit: Optional[str] = Field(None, max_length=100)
    staff: List[SetupStaffEntry] = Field(default_factory=list)
    leave_rejoin_buffer_days: int = 2
    auto_assign_standby: bool = True


# Manual override schemas
class ManualOverrideRequest(BaseModel):
    date: date
    new_duty_id: int
    new_standby_id: Optional[int] = None
    reason: Optional[str] = None
    override_type: str = "emergency"   # emergency | routine | other
    heal_after: bool = False


class ManualOverrideLogOut(BaseModel):
    id: int
    date: date
    override_type: str
    reason: Optional[str] = None
    heal_applied: bool
    prev_duty_id: Optional[int] = None
    prev_standby_id: Optional[int] = None
    new_duty_id: int
    new_standby_id: Optional[int] = None
    prev_duty: Optional[StaffOut] = None
    prev_standby: Optional[StaffOut] = None
    new_duty: Optional[StaffOut] = None
    new_standby: Optional[StaffOut] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
